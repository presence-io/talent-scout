import { execa } from 'execa';

import { FileCache } from './cache.js';

export interface PaginationOptions {
  perPage?: number;
  maxPages?: number;
  sleepMs?: number;
}

interface SearchResponse<T> {
  total_count: number;
  items: T[];
}

const DEFAULT_PER_PAGE = 100;
const DEFAULT_MAX_PAGES = 10;

/**
 * Low-level wrapper around `gh api` CLI.
 * Handles pagination, rate limiting, and caching.
 */
export async function ghApi<T>(
  endpoint: string,
  options: PaginationOptions & {
    paginate?: boolean;
    accept?: string;
    cache?: FileCache;
    cacheTtl?: number;
    method?: string;
  } = {}
): Promise<T[]> {
  const {
    perPage = DEFAULT_PER_PAGE,
    maxPages = DEFAULT_MAX_PAGES,
    sleepMs,
    paginate = true,
    accept,
    cache,
    cacheTtl = 86400,
    method = 'GET',
  } = options;

  const defaultSleep = sleepMs ?? 1000;
  const results: T[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const sep = endpoint.includes('?') ? '&' : '?';
    const url = `${endpoint}${sep}per_page=${String(perPage)}&page=${String(page)}`;

    // Check cache first
    if (cache) {
      const cached = await cache.get<T[]>(`github/${url}`);
      if (cached) {
        results.push(...cached);
        if (!paginate || cached.length < perPage) break;
        continue;
      }
    }

    const args = ['api', url, '-X', method, '--header', 'X-GitHub-Api-Version:2022-11-28'];
    if (accept) {
      args.push('--header', `Accept:${accept}`);
    }

    let stdout: string;
    try {
      const result = await execa('gh', args, { timeout: 120_000 });
      stdout = result.stdout;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('rate limit') || message.includes('403')) {
        // Rate limited - wait and retry this page
        await sleep(60_000);
        page--;
        continue;
      }
      if (message.includes('422')) {
        break;
      }
      throw err;
    }

    if (!stdout.trim() || stdout.trim() === '[]' || stdout.trim() === 'null') {
      break;
    }

    const data: unknown = JSON.parse(stdout);

    // Search endpoints return {total_count, items: [...]}
    if (isSearchResponse<T>(data)) {
      const items = data.items;
      if (cache) {
        await cache.set(`github/${url}`, items, cacheTtl);
      }
      results.push(...items);
      if (items.length < perPage) break;
    } else if (Array.isArray(data)) {
      if (cache) {
        await cache.set(`github/${url}`, data as T[], cacheTtl);
      }
      results.push(...(data as T[]));
      if (data.length < perPage) break;
    } else {
      // Single object response
      results.push(data as T);
      break;
    }

    if (!paginate) break;

    await sleep(defaultSleep);
  }

  return results;
}

/**
 * Get a single resource from GitHub API (no pagination).
 */
export async function ghApiSingle<T>(
  endpoint: string,
  options: { cache?: FileCache; cacheTtl?: number } = {}
): Promise<T | null> {
  const { cache, cacheTtl = 86400 } = options;

  if (cache) {
    const cached = await cache.get<T>(`github/${endpoint}`);
    if (cached) return cached;
  }

  try {
    const { stdout } = await execa(
      'gh',
      ['api', endpoint, '--header', 'X-GitHub-Api-Version:2022-11-28'],
      { timeout: 120_000 }
    );
    const data = JSON.parse(stdout) as T;
    if (cache) {
      await cache.set(`github/${endpoint}`, data, cacheTtl);
    }
    return data;
  } catch {
    return null;
  }
}

function isSearchResponse<T>(data: unknown): data is SearchResponse<T> {
  return (
    typeof data === 'object' &&
    data !== null &&
    'items' in data &&
    Array.isArray((data as SearchResponse<T>).items)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
