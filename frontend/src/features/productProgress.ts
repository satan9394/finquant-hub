export const PRODUCT_PROGRESS_KEY = 'finquant_product_progress_v1';
export const PRODUCT_PROGRESS_EVENT = 'finquant:product-progress';

export type ProductProgressStep = 'analysis' | 'backtest' | 'saved';

export interface ProductProgress {
  analysis: boolean;
  backtest: boolean;
  saved: boolean;
  helpDismissed: boolean;
}

const emptyProgress = (): ProductProgress => ({
  analysis: false,
  backtest: false,
  saved: false,
  helpDismissed: false,
});

export function readProductProgress(): ProductProgress {
  if (typeof window === 'undefined') return emptyProgress();
  try {
    const stored = JSON.parse(localStorage.getItem(PRODUCT_PROGRESS_KEY) || '{}') as Partial<ProductProgress>;
    return {
      analysis: stored.analysis === true,
      backtest: stored.backtest === true,
      saved: stored.saved === true,
      helpDismissed: stored.helpDismissed === true,
    };
  } catch {
    return emptyProgress();
  }
}

function writeProductProgress(progress: ProductProgress): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PRODUCT_PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    return;
  }
  window.dispatchEvent(new Event(PRODUCT_PROGRESS_EVENT));
}

export function markProductProgress(step: ProductProgressStep): void {
  writeProductProgress({ ...readProductProgress(), [step]: true });
}

export function setProductHelpDismissed(helpDismissed: boolean): void {
  writeProductProgress({ ...readProductProgress(), helpDismissed });
}
