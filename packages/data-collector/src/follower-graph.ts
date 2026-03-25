import { type Signal, type TalentConfig, FileCache, ghApi } from '@talent-scout/shared';

interface UserItem {
  login: string;
}

/** Expand candidate pool via follower graph of known Chinese developers */
export async function collectFollowerGraphSignals(
  config: TalentConfig,
  cache: FileCache,
  seedUsers: string[],
): Promise<Map<string, Signal[]>> {
  const candidates = new Map<string, Signal[]>();
  const graphConfig = config.graph_expansion;

  if (!graphConfig.enabled) return candidates;

  const seedsToProcess = seedUsers.slice(0, graphConfig.max_seed_users);

  for (const seedUser of seedsToProcess) {
    const followers = await ghApi<UserItem>(`/users/${seedUser}/followers`, {
      perPage: graphConfig.max_followers_per_user,
      maxPages: 1,
      sleepMs: 200,
      cache,
      cacheTtl: config.cache.ttl.user_profile,
    });

    for (const follower of followers) {
      const login = follower.login.toLowerCase();
      if (!login || login === seedUser.toLowerCase()) continue;

      const signals = candidates.get(login) ?? [];
      signals.push({
        type: 'graph:follower',
        detail: `follows confirmed Chinese dev ${seedUser}`,
        weight: 0.5,
        source: `graph:${seedUser}`,
        object_id: `${seedUser}:${login}`,
      });
      candidates.set(login, signals);
    }
  }

  return candidates;
}
