import { FileCache, type Signal, type TalentConfig, ghApi } from '@talent-scout/shared';

interface UserItem {
  login: string;
}

interface ForkItem {
  owner: { login: string };
}

/** Collect stargazers/forks of community repos defined in config */
export async function collectCommunitySignals(
  config: TalentConfig,
  cache: FileCache
): Promise<Map<string, Signal[]>> {
  const candidates = new Map<string, Signal[]>();

  for (const ccfg of config.chinese_community) {
    const { owner, repo, type, weight, max_pages } = ccfg;

    if (type === 'stargazers' || type === 'contributors') {
      const endpoint =
        type === 'contributors'
          ? `/repos/${owner}/${repo}/contributors`
          : `/repos/${owner}/${repo}/stargazers`;

      const items = await ghApi<UserItem>(endpoint, {
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
          type: `community:${type === 'contributors' ? 'contributor' : 'stargazer'}`,
          detail: `${type} of ${owner}/${repo}`,
          weight,
          source: `community:${owner}/${repo}`,
          repo: `${owner}/${repo}`,
          object_id: login,
        });
        candidates.set(login, signals);
      }
    } else {
      // forks
      const items = await ghApi<ForkItem>(`/repos/${owner}/${repo}/forks?sort=newest`, {
        maxPages: max_pages,
        sleepMs: 200,
        cache,
        cacheTtl: config.cache.ttl.events,
      });

      for (const item of items) {
        const login = item.owner.login.toLowerCase();
        if (!login) continue;

        const signals = candidates.get(login) ?? [];
        signals.push({
          type: 'community:fork',
          detail: `forked ${owner}/${repo}`,
          weight,
          source: `community:${owner}/${repo}`,
          repo: `${owner}/${repo}`,
          object_id: login,
        });
        candidates.set(login, signals);
      }
    }
  }

  return candidates;
}
