export function formatScore(score: number): string {
  return score.toFixed(1);
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}

export function formatAction(action: string): string {
  const map: Record<string, string> = {
    reach_out: 'Reach Out',
    monitor: 'Monitor',
    skip: 'Skip',
  };
  return map[action] ?? action;
}

export function formatTier(tier: string): string {
  const map: Record<string, string> = {
    consumer: 'Consumer',
    user: 'User',
    builder: 'Builder',
    amplifier: 'Amplifier',
  };
  return map[tier] ?? tier;
}

export function actionBadgeClass(action: string): string {
  const map: Record<string, string> = {
    reach_out: 'badge-success',
    monitor: 'badge-warning',
    skip: 'badge-error',
  };
  return map[action] ?? 'badge-ghost';
}
