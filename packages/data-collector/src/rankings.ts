import {
  FileCache,
  type Signal,
  type SignalType,
  type TalentConfig,
  ghApiSingle,
} from '@talent-scout/shared';
import { chromium } from 'playwright';

interface RankingSource {
  name: string;
  type: 'github-readme' | 'web-scrape';
  repo?: string;
  url?: string;
  signal_type: 'seed:ranking' | 'seed:list';
  weight: number;
}

/**
 * Parse GitHub usernames from 1c7/chinese-independent-developer README content.
 * Extracts usernames from links like `[Github](https://github.com/username)`.
 */
export function parseIndieDevList(markdown: string): string[] {
  // Match GitHub profile links: https://github.com/username
  // Exclude links to repos (containing second slash after username) and special paths
  const pattern =
    /https?:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38})(?=[)\]\/\s,])/gi;
  const usernames = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    const raw = match[1];
    if (!raw) continue;
    const username = raw.toLowerCase();
    // Skip common non-user paths
    if (isReservedPath(username)) continue;
    usernames.add(username);
  }

  return [...usernames];
}

const RESERVED_PATHS = new Set([
  'about',
  'explore',
  'topics',
  'trending',
  'collections',
  'events',
  'sponsors',
  'settings',
  'notifications',
  'marketplace',
  'pricing',
  'features',
  'security',
  'enterprise',
  'orgs',
  'codespaces',
  'issues',
  'pulls',
  'discussions',
  'actions',
  'packages',
  'stars',
  'new',
  'login',
  'signup',
  'join',
]);

function isReservedPath(name: string): boolean {
  return RESERVED_PATHS.has(name);
}

interface ReadmeResponse {
  content: string;
  encoding: string;
}

/**
 * Fetch and parse GitHub usernames from a repository README.
 */
async function collectGitHubReadmeSource(
  source: RankingSource,
  cache: FileCache,
  cacheTtl: number
): Promise<Map<string, Signal[]>> {
  const candidates = new Map<string, Signal[]>();

  if (!source.repo) return candidates;

  // Fetch README via GitHub API (returns JSON with base64 content)
  const response = await ghApiSingle<ReadmeResponse>(`/repos/${source.repo}/readme`, {
    cache,
    cacheTtl,
  });

  if (!response) {
    console.warn(`Rankings: could not fetch README for ${source.repo}`);
    return candidates;
  }

  const markdown = Buffer.from(response.content, 'base64').toString('utf-8');

  const usernames = parseIndieDevList(markdown);
  console.log(`Rankings: parsed ${String(usernames.length)} usernames from ${source.name}`);

  for (const username of usernames) {
    const signals = candidates.get(username) ?? [];
    signals.push({
      type: source.signal_type as SignalType,
      detail: `Listed in ${source.name}`,
      weight: source.weight,
      source: `ranking:${source.name}`,
      object_id: `${source.name}:${username}`,
    });
    candidates.set(username, signals);
  }

  return candidates;
}

/**
 * Extract GitHub usernames from page HTML content.
 * Parses all links matching https://github.com/{username} pattern.
 */
export function extractUsernamesFromHtml(html: string): string[] {
  const pattern =
    /href=["']https?:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38})["']/gi;
  const usernames = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const raw = match[1];
    if (!raw) continue;
    const username = raw.toLowerCase();
    if (isReservedPath(username)) continue;
    usernames.add(username);
  }

  return [...usernames];
}

/**
 * Scrape china-ranking.aolifu.org for Chinese developer usernames.
 *
 * The site renders a single page with ~1000 developer cards, each containing
 * an `<a href="https://github.com/{username}">` link. No pagination needed.
 */
async function scrapeChinaRanking(): Promise<string[]> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto('https://china-ranking.aolifu.org', {
      waitUntil: 'networkidle',
      timeout: 60_000,
    });

    const html = await page.content();
    return extractUsernamesFromHtml(html);
  } finally {
    await browser.close();
  }
}

/**
 * Scrape githubrank.com for Chinese developer usernames.
 *
 * The site renders a single HTML table with ~1000 rows.
 * Each row has a link to `https://github.com/{username}`.
 * No JavaScript rendering or pagination needed.
 */
async function scrapeGitHubRank(): Promise<string[]> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto('https://githubrank.com', {
      waitUntil: 'networkidle',
      timeout: 60_000,
    });

    const html = await page.content();
    return extractUsernamesFromHtml(html);
  } finally {
    await browser.close();
  }
}

/**
 * Collect ranking signals from a web-scrape source using Playwright
 * to render the page and extract GitHub usernames.
 */
async function collectWebScrapeSource(
  source: RankingSource,
  cache: FileCache,
  cacheTtl: number
): Promise<Map<string, Signal[]>> {
  const candidates = new Map<string, Signal[]>();

  // Check cache first — scraping is expensive
  const cacheKey = `ranking_web_${source.name}`;
  const cached = await cache.get<string[]>(cacheKey);

  let usernames: string[];
  if (cached) {
    console.log(`Rankings: using cached web-scrape data for ${source.name}`);
    usernames = cached;
  } else {
    console.log(`Rankings: scraping ${source.url ?? source.name} via Playwright...`);
    try {
      switch (source.name) {
        case 'china-ranking':
          usernames = await scrapeChinaRanking();
          break;
        case 'githubrank':
          usernames = await scrapeGitHubRank();
          break;
        default:
          console.warn(`Rankings: unknown web-scrape source "${source.name}" — skipping`);
          return candidates;
      }
      console.log(`Rankings: scraped ${String(usernames.length)} usernames from ${source.name}`);
      await cache.set(cacheKey, usernames, cacheTtl);
    } catch (error) {
      console.error(`Rankings: failed to scrape ${source.name}:`, error);
      return candidates;
    }
  }

  for (const username of usernames) {
    const signals = candidates.get(username) ?? [];
    signals.push({
      type: source.signal_type as SignalType,
      detail: `Listed in ${source.name}`,
      weight: source.weight,
      source: `ranking:${source.name}`,
      object_id: `${source.name}:${username}`,
    });
    candidates.set(username, signals);
  }

  return candidates;
}

/**
 * Collect ranking/seed signals from all configured ranking sources.
 */
export async function collectRankingSignals(
  config: TalentConfig,
  cache: FileCache
): Promise<Map<string, Signal[]>> {
  const allCandidates = new Map<string, Signal[]>();
  const cacheTtl = config.cache.ttl.rankings;

  for (const source of config.ranking_sources) {
    let result: Map<string, Signal[]>;

    switch (source.type) {
      case 'github-readme':
        result = await collectGitHubReadmeSource(source, cache, cacheTtl);
        break;
      case 'web-scrape':
        result = await collectWebScrapeSource(source, cache, cacheTtl);
        break;
      default:
        console.warn(`Rankings: unknown source type "${(source as RankingSource).type}"`);
        continue;
    }

    // Merge into allCandidates
    for (const [username, signals] of result) {
      const existing = allCandidates.get(username) ?? [];
      existing.push(...signals);
      allCandidates.set(username, existing);
    }
  }

  return allCandidates;
}
