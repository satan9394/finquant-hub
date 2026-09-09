// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PricingConfigPanel from '../src/components/settings/PricingConfigPanel';
import UsageRecordsPanel from '../src/components/settings/UsageRecordsPanel';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { formatCost } from '../src/services/usageApi';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../src/services/api', () => ({ default: api }));

function wrap(node: React.ReactNode) {
  return <LanguageProvider>{node}</LanguageProvider>;
}

const pricing = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 1,
  model_name: 'deepseek-v4-flash',
  input_per_1m: 0.5,
  output_per_1m: 1.5,
  currency: 'CNY',
  source: 'manual',
  updated_at: '2026-09-13 08:00:00',
  ...overrides,
});

describe('formatCost', () => {
  it('keeps a tiny non-zero cost visible instead of rounding it to 0', () => {
    expect(formatCost(0.0000004, 'CNY')).toBe('CNY <0.000001');
    expect(formatCost(0.00021, 'CNY')).toBe('CNY 0.00021');
    expect(formatCost(1.239, 'USD')).toBe('USD 1.24');
    expect(formatCost(0, 'CNY')).toBe('CNY 0');
  });

  it('returns a placeholder for missing or non-finite values, never a fake amount', () => {
    expect(formatCost(null)).toBe('-');
    expect(formatCost(undefined)).toBe('-');
    expect(formatCost(Number.NaN)).toBe('-');
  });
});

describe('PricingConfigPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('finquant_lang', 'zh');
    vi.clearAllMocks();
  });

  it('lists configured unit prices with model, prices, currency and updated time', async () => {
    api.get.mockResolvedValue({ data: { items: [pricing()], total: 1 } });

    render(wrap(<PricingConfigPanel />));

    expect(api.get).toHaveBeenCalledWith('/model-pricing');
    expect(await screen.findByText('deepseek-v4-flash')).toBeTruthy();
    expect(screen.getByText('0.5')).toBeTruthy();
    expect(screen.getByText('1.5')).toBeTruthy();
    expect(screen.getByText('CNY')).toBeTruthy();
    expect(screen.getByText('2026-09-13 08:00:00')).toBeTruthy();
  });

  it('states honestly that nothing is priced instead of showing fake zero costs', async () => {
    api.get.mockResolvedValue({ data: { items: [], total: 0 } });

    render(wrap(<PricingConfigPanel />));

    expect(await screen.findByTestId('pricing-empty')).toBeTruthy();
    expect(screen.getByText(/尚未配置任何模型单价/)).toBeTruthy();
    expect(screen.getByText(/不内置任何模型单价/)).toBeTruthy();
  });

  it('rejects a blank model name before calling the API', async () => {
    api.get.mockResolvedValue({ data: { items: [], total: 0 } });
    render(wrap(<PricingConfigPanel />));
    await screen.findByTestId('pricing-empty');

    fireEvent.click(screen.getByTestId('pricing-add'));
    const okButton = await screen.findByRole('button', { name: '新增单价' });
    fireEvent.click(okButton);

    expect(await screen.findByText('模型名不能为空')).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('creates a price row and reloads the list', async () => {
    api.get
      .mockResolvedValueOnce({ data: { items: [], total: 0 } })
      .mockResolvedValue({ data: { items: [pricing({ id: 2, model_name: 'new-model' })], total: 1 } });
    api.post.mockResolvedValue({ data: pricing({ id: 2, model_name: 'new-model' }) });

    render(wrap(<PricingConfigPanel />));
    await screen.findByTestId('pricing-empty');

    fireEvent.click(screen.getByTestId('pricing-add'));
    fireEvent.change(await screen.findByTestId('pricing-model-name'), { target: { value: 'new-model' } });
    fireEvent.change(screen.getByTestId('pricing-input-price'), { target: { value: '2.5' } });
    fireEvent.change(screen.getByTestId('pricing-output-price'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: '新增单价' }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/model-pricing', {
        model_name: 'new-model',
        input_per_1m: 2.5,
        output_per_1m: 7,
        currency: 'CNY',
      }),
    );
    expect(await screen.findByText('new-model')).toBeTruthy();
  });

  it('surfaces a load failure without inventing data', async () => {
    api.get.mockRejectedValue(new Error('pricing down'));
    render(wrap(<PricingConfigPanel />));
    expect(await screen.findByText('pricing down')).toBeTruthy();
  });
});

describe('UsageRecordsPanel cost column', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('finquant_lang', 'zh');
    vi.clearAllMocks();
  });

  it('shows the estimate for priced records and 未配置单价 for unpriced ones', async () => {
    api.get.mockResolvedValue({
      data: {
        items: [
          {
            id: 1, session_type: 'chat', model_name: 'priced', conversation_id: null,
            prompt_tokens: 1_000_000, completion_tokens: 0, total_tokens: 1_000_000,
            created_at: '2026-09-02 08:00:00', priced: true, currency: 'CNY', estimated_cost: 2.0,
          },
          {
            id: 2, session_type: 'chat', model_name: 'unpriced', conversation_id: null,
            prompt_tokens: 10, completion_tokens: 5, total_tokens: 15,
            created_at: '2026-09-01 08:00:00', priced: false, currency: null, estimated_cost: null,
          },
        ],
        total: 2,
      },
    });

    render(wrap(<UsageRecordsPanel />));

    expect(await screen.findByText('CNY 2')).toBeTruthy();
    expect(screen.getByText('未配置单价')).toBeTruthy();
    // 未配置单价的行绝不显示 0 冒充免费。
    expect(screen.queryByText('CNY 0')).toBeNull();
  });
});
