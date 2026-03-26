import {
  FileCache,
  type Signal,
  type SignalType,
  type TalentConfig,
  ghApi,
  loadConfig,
} from '@talent-scout/shared';

interface CodeSearchItem {
  repository: { owner: { login: string }; full_name: string };
}

interface CommitSearchItem {
  author: { login: string } | null;
  repository: { full_name: string };
  commit: { message: string };
  sha: string;
}

interface RepoSearchItem {
  owner: { login: string };
  full_name: string;
}

/** Collect code file signals (CLAUDE.md, .cursorrules, etc.) */
export async function collectCodeSignals(
  config: TalentConfig,
  cache: FileCache
): Promise<Map<string, Signal[]>> {
  const candidates = new Map<string, Signal[]>();

  for (const sig of config.code_signals) {
    const q = `filename:${sig.filename}+path:${sig.path}`;
    const items = await ghApi<CodeSearchItem>(
      `/search/code?q=${encodeSearchQuery(q)}&sort=indexed`,
      {
        maxPages: config.api_budget.search_pages_per_query,
        sleepMs: config.api_budget.search_sleep_ms,
        cache,
        cacheTtl: config.cache.ttl.search_results,
      }
    );

    for (const item of items) {
      const owner = item.repository.owner.login.toLowerCase();
      if (!owner) continue;

      const signals = candidates.get(owner) ?? [];
      signals.push({
        type: labelToSignalType(sig.label),
        detail: `has ${sig.filename} in repo`,
        weight: sig.weight,
        source: 'code-search',
        repo: item.repository.full_name,
        object_id: sig.filename,
      });
      candidates.set(owner, signals);
    }
  }

  return candidates;
}

/** Collect commit co-author signals */
export async function collectCommitSignals(
  config: TalentConfig,
  cache: FileCache
): Promise<Map<string, Signal[]>> {
  const candidates = new Map<string, Signal[]>();

  for (const qcfg of config.commit_queries) {
    const q = qcfg.query;
    const items = await ghApi<CommitSearchItem>(
      `/search/commits?q=${encodeSearchQuery(q)}&sort=committer-date`,
      {
        maxPages: config.api_budget.search_pages_per_query,
        sleepMs: config.api_budget.search_sleep_ms,
        accept: 'application/vnd.github.cloak-preview+json',
        cache,
        cacheTtl: config.cache.ttl.search_results,
      }
    );

    for (const item of items) {
      const login = item.author?.login.toLowerCase();
      if (!login) continue;

      const signals = candidates.get(login) ?? [];
      signals.push({
        type: labelToSignalType(qcfg.label),
        detail: `${item.repository.full_name}: ${item.commit.message.slice(0, 60)}`,
        weight: qcfg.weight,
        source: 'commit-search',
        repo: item.repository.full_name,
        object_id: item.sha,
      });
      candidates.set(login, signals);
    }
  }

  return candidates;
}

/** Collect topic signals (claude-code, mcp-server, etc.) */
export async function collectTopicSignals(
  config: TalentConfig,
  cache: FileCache
): Promise<Map<string, Signal[]>> {
  const candidates = new Map<string, Signal[]>();

  for (const tcfg of config.topic_queries) {
    const items = await ghApi<RepoSearchItem>(
      `/search/repositories?q=topic:${tcfg.topic}&sort=updated`,
      {
        maxPages: tcfg.max_pages ?? config.api_budget.search_pages_per_query,
        sleepMs: config.api_budget.search_sleep_ms,
        cache,
        cacheTtl: config.cache.ttl.search_results,
      }
    );

    for (const item of items) {
      const owner = item.owner.login.toLowerCase();
      if (!owner) continue;

      const signals = candidates.get(owner) ?? [];
      signals.push({
        type: `topic:${tcfg.topic}` as SignalType,
        detail: `created topic:${tcfg.topic} repo`,
        weight: tcfg.weight,
        source: 'topic-search',
        repo: item.full_name,
        object_id: item.full_name,
      });
      candidates.set(owner, signals);
    }
  }

  return candidates;
}

/** Collect all GitHub signal sources in sequence */
export async function collectAllGitHubSignals(cache: FileCache): Promise<Map<string, Signal[]>> {
  const config = await loadConfig();
  const merged = new Map<string, Signal[]>();

  const sources = [
    collectCodeSignals(config, cache),
    collectCommitSignals(config, cache),
    collectTopicSignals(config, cache),
  ];

  for (const source of sources) {
    const result = await source;
    for (const [username, signals] of result) {
      const existing = merged.get(username) ?? [];
      existing.push(...signals);
      merged.set(username, existing);
    }
  }

  return merged;
}

function labelToSignalType(label: string): SignalType {
  // The label in talents.yaml is used directly as the SignalType.
  // Legacy ai-config:/ai-coauthor: labels are mapped for backward compatibility.
  const legacyMapping: Record<string, SignalType> = {
    'ai-config:claude': 'code:claude-md',
    'ai-config:cursor': 'code:cursor-rules',
    'ai-config:cline': 'code:cline-rules',
    'ai-config:copilot': 'code:agents-md',
    'ai-config:windsurf': 'code:windsurf-rules',
    'ai-coauthor:claude': 'commit:claude-coauthor',
    'ai-coauthor:copilot': 'commit:copilot-coauthor',
  };
  return legacyMapping[label] ?? (label as SignalType);
}

function encodeSearchQuery(q: string): string {
  return encodeURIComponent(q).replace(/%2B/g, '+').replace(/%3A/g, ':');
}
