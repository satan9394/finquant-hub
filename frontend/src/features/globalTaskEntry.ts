import { externalTicker, tickerContract } from './tickerContract';

export type GlobalTaskAction = 'analysis' | 'research' | 'backtest' | 'portfolio' | 'thesis' | 'alert' | 'question';

export type GlobalCommandIntent = 'compare' | 'monitor' | 'discover' | 'strategy';

export interface GlobalTaskTarget {
  code: string;
  name: string;
  market?: string;
}

export const RECENT_TARGETS_KEY = 'finquant_recent_targets_v1';

export function isLikelyTicker(value: string): boolean {
  const parsed = tickerContract(value);
  return parsed.kind === 'supported' && (parsed.market !== 'us' || parsed.external.length <= 6);
}

export function globalTaskPath(action: GlobalTaskAction, target: GlobalTaskTarget | null, question = ''): string {
  if (action === 'question') return `/research?prompt=${encodeURIComponent(question.trim())}`;
  if (!target) return '/';

  const code = externalTicker(target.code) ?? target.code.trim().toUpperCase();
  if (action === 'analysis') return `/analysis/${encodeURIComponent(code)}?autorun=0`;
  if (action === 'research') return `/research/${encodeURIComponent(code)}`;
  if (action === 'backtest') return `/strategy-lab/ma-crossover?symbol=${encodeURIComponent(code)}`;

  const params = new URLSearchParams();
  if (action === 'portfolio') {
    params.set('code', code);
    params.set('name', target.name);
    return `/portfolio?${params.toString()}`;
  }
  if (action === 'thesis') return `/research?mode=thesis&new=1&ticker=${encodeURIComponent(code)}`;
  params.set('new', '1');
  params.set('ticker', code);
  return `/alerts?${params.toString()}`;
}

export function globalCommandIntent(value: string): { intent: GlobalCommandIntent; path: string } | null {
  const query = value.trim();
  if (!query || isLikelyTicker(query)) return null;
  const encoded = encodeURIComponent(query);
  if (/(?:回测|backtest|ma\s*\d+.*ma\s*\d+)/i.test(query)) {
    return { intent: 'strategy', path: `/strategy-lab/ma-crossover?prompt=${encoded}` };
  }
  if (/(?:监控|每\s*\d+\s*小时|monitor|alert)/i.test(query)) {
    return { intent: 'monitor', path: `/alerts?draft=${encoded}` };
  }
  if (/(?:筛选|选股|roe|fcf|负债率|screen|discover)/i.test(query)) {
    return { intent: 'discover', path: `/discover?query=${encoded}` };
  }
  if (/(?:比较|对比|\bvs\.?\b|compare)/i.test(query)) {
    return { intent: 'compare', path: `/compare?query=${encoded}` };
  }
  return null;
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
