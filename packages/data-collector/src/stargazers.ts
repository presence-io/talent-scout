import { type Signal, type TalentConfig, FileCache, ghApi } from '@talent-scout/shared';

interface UserItem {
  login: string;
}

/** Collect stargazers of notable AI coding repos */
export async function collectStargazerSignals(
  config: TalentConfig,
  cache: FileCache,
): Promise<Map<string, Signal[]>> {
  const candidates = new Map<string, Signal[]>();

  for (const scfg of config.stargazer_repos) {
    const { owner, repo, weight, max_pages } = scfg;

    const items = await ghApi<UserItem>(`/repos/${owner}/${repo}/stargazers`, {
      maxPages: max_pages,
      sleepMs: 200,
      cache,
      cacheTtl: config.cache.ttl.events,
    });

    for (const item of items) {
      const login = item.login.toLowerCase();
      if (!login) continue;

      const signals = candidates.get(login) ?? [];
      signals.push({
        type: 'star:repo',
        detail: `starred ${owner}/${repo}`,
        weight,
        source: `stargazer:${owner}/${repo}`,
        repo: `${owner}/${repo}`,
        object_id: login,
      });
      candidates.set(login, signals);
    }
  }

  return candidates;
}
