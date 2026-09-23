export type FinQuantToken =
  | '--fq-ai-primary'
  | '--fq-ai-soft'
  | '--fq-secondary'
  | '--fq-bg-page'
  | '--fq-bg-subtle'
  | '--fq-surface-1'
  | '--fq-surface-2'
  | '--fq-border'
  | '--fq-border-strong'
  | '--fq-text-primary'
  | '--fq-text-secondary'
  | '--fq-text-tertiary'
  | '--fq-evidence-fact'
  | '--fq-evidence-inference'
  | '--fq-evidence-model'
  | '--fq-evidence-unknown'
  | '--fq-price-up'
  | '--fq-price-down'
  | '--fq-system-info'
  | '--fq-system-warning'
  | '--fq-system-error'
  | '--fq-opportunity'
  | '--fq-risk'
  | '--fq-warning';

export const tokenVar = (name: FinQuantToken) => `var(${name})`;

export function readToken(name: FinQuantToken): string {
  if (typeof document === 'undefined') return tokenVar(name);
  const root = document.querySelector<HTMLElement>('.app-theme') ?? document.documentElement;
  return getComputedStyle(root).getPropertyValue(name).trim() || tokenVar(name);
}

export function readChartTokens() {
  return {
    background: readToken('--fq-surface-1'),
    surface: readToken('--fq-surface-2'),
    grid: readToken('--fq-border'),
    gridStrong: readToken('--fq-border-strong'),
    text: readToken('--fq-text-secondary'),
    textPrimary: readToken('--fq-text-primary'),
    primary: readToken('--fq-ai-primary'),
    secondary: readToken('--fq-secondary'),
    up: readToken('--fq-price-up'),
    down: readToken('--fq-price-down'),
    warning: readToken('--fq-warning'),
    model: readToken('--fq-evidence-model'),
    unknown: readToken('--fq-evidence-unknown'),
    risk: readToken('--fq-risk'),
  };
}

export function withAlpha(color: string, alpha: number): string {
  if (!/^#[\da-f]{6}$/i.test(color)) return color;
  const alphaHex = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${color}${alphaHex}`;
}
