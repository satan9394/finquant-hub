export type GlobalTaskAction = 'analysis' | 'research' | 'backtest' | 'portfolio' | 'thesis' | 'alert' | 'question';

export interface GlobalTaskTarget {
  code: string;
  name: string;
  market?: string;
}

export const RECENT_TARGETS_KEY = 'finquant_recent_targets_v1';

export function isLikelyTicker(value: string): boolean {
  return /^(?:\d{5,6}(?:\.HK)?|[A-Z]{1,6})$/i.test(value.trim());
}

export function globalTaskPath(action: GlobalTaskAction, target: GlobalTaskTarget | null, question = ''): string {
  if (action === 'question') return `/chat?prompt=${encodeURIComponent(question.trim())}`;
  if (!target) return '/';

  const code = target.code.trim().toUpperCase();
  if (action === 'analysis') return `/analysis/${encodeURIComponent(code)}?autorun=0`;
  if (action === 'research') return `/research/${encodeURIComponent(code)}`;
  if (action === 'backtest') return `/strategy-lab/ma-crossover?symbol=${encodeURIComponent(code)}`;

  const params = new URLSearchParams();
  if (action === 'portfolio') {
    params.set('code', code);
    params.set('name', target.name);
    return `/portfolio?${params.toString()}`;
  }
  params.set('new', '1');
  params.set('ticker', code);
  return `/${action === 'thesis' ? 'thesis' : 'alerts'}?${params.toString()}`;
}

export function readRecentTargets(): GlobalTaskTarget[] {
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_TARGETS_KEY) || '[]') as unknown;
    if (!Array.isArray(stored)) return [];
    return stored.filter((item): item is GlobalTaskTarget => Boolean(
      item && typeof item === 'object'
      && typeof (item as GlobalTaskTarget).code === 'string'
      && typeof (item as GlobalTaskTarget).name === 'string',
    )).slice(0, 5);
  } catch {
    return [];
  }
}

export function rememberRecentTarget(target: GlobalTaskTarget): GlobalTaskTarget[] {
  const next = [target, ...readRecentTargets().filter((item) => item.code !== target.code)].slice(0, 5);
  localStorage.setItem(RECENT_TARGETS_KEY, JSON.stringify(next));
  return next;
}
