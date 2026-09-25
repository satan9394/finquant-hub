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

const CHART_FALLBACK_TOKENS: Record<FinQuantToken, string> = {
  '--fq-surface-1': '#ffffff',
  '--fq-surface-2': '#fafafa',
  '--fq-border': '#d9d9d9',
  '--fq-border-strong': '#bfbfbf',
  '--fq-text-primary': '#172033',
  '--fq-text-secondary': '#5c697a',
  '--fq-text-tertiary': '#66707f',
  '--fq-ai-primary': '#1677ff',
  '--fq-ai-soft': '#e6f4ff',
  '--fq-secondary': '#4096ff',
  '--fq-bg-page': '#f5f7fa',
  '--fq-bg-subtle': '#f0f2f5',
  '--fq-evidence-fact': '#2563eb',
  '--fq-evidence-inference': '#a85a00',
  '--fq-evidence-model': '#7557c8',
  '--fq-evidence-unknown': '#626c7d',
  '--fq-price-up': '#d03f56',
  '--fq-price-down': '#13805f',
  '--fq-system-info': '#2561e6',
  '--fq-system-warning': '#8f6000',
  '--fq-system-error': '#b42318',
  '--fq-opportunity': '#12785f',
  '--fq-risk': '#d13c3c',
  '--fq-warning': '#8f6000',
};

function readChartToken(name: FinQuantToken): string {
  const val = readToken(name);
  if (!val || val.startsWith('var(')) {
    return CHART_FALLBACK_TOKENS[name] ?? '#888888';
  }
  return val;
}

export function readChartTokens() {
  return {
    background: readChartToken('--fq-surface-1'),
    surface: readChartToken('--fq-surface-2'),
    grid: readChartToken('--fq-border'),
    gridStrong: readChartToken('--fq-border-strong'),
    text: readChartToken('--fq-text-secondary'),
    textPrimary: readChartToken('--fq-text-primary'),
    primary: readChartToken('--fq-ai-primary'),
    secondary: readChartToken('--fq-secondary'),
    up: readChartToken('--fq-price-up'),
    down: readChartToken('--fq-price-down'),
    warning: readChartToken('--fq-warning'),
    model: readChartToken('--fq-evidence-model'),
    unknown: readChartToken('--fq-evidence-unknown'),
    risk: readChartToken('--fq-risk'),
  };
}

export function withAlpha(color: string, alpha: number): string {
  if (!/^#[\da-f]{6}$/i.test(color)) return color;
  const alphaHex = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${color}${alphaHex}`;
}
