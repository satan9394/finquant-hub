// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import StrategyLab from '../src/pages/StrategyLab';
import apiClient from '../src/services/api';
import { fetchMarketPulse } from '../src/services/marketDiscoveryApi';
import { createBacktest, fetchInstrumentBars, listBacktests, saveBacktest } from '../src/services/researchApi';
import type { BacktestRun } from '../src/types/research';

vi.mock('../src/services/researchApi', () => ({
  createBacktest: vi.fn(),
  fetchBacktest: vi.fn(),
  fetchInstrumentBars: vi.fn(),
  listBacktests: vi.fn(async () => []),
  saveBacktest: vi.fn(),
}));
vi.mock('../src/services/marketDiscoveryApi', () => ({ fetchMarketPulse: vi.fn() }));
vi.mock('../src/services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../src/components/research/BacktestCharts', () => ({
  default: () => <div data-testid="backtest-charts" />,
}));

describe('StrategyLab', { timeout: 15_000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchInstrumentBars).mockResolvedValue({ items: Array.from({ length: 60 }, (_, index) => ({ day: `2025-01-${index + 1}`, close: 1 })) } as never);
    vi.mocked(fetchMarketPulse).mockResolvedValue({
      sections: {
        weekly: {
          items: [{
            code: 'sh600519', name: '贵州茅台', price: 1500,
            weekly_change_percent: 12.3, change_percent: 2.1,
            turnover_rate: 1.2, amount: 100_000_000, amplitude: 3,
            volume_ratio: 1, industry: '白酒', ths_main_net_inflow: null,
            ths_industry: null, ths_main_net_inflow_unit: 'wan_cny',
            source_status: { eastmoney: true, tonghuashun: false },
            reason_tags: ['一周大涨'], eastmoney_url: '', tonghuashun_url: '',
          }],
        },
      },
    } as never);
  });

  // The one-sentence rule entry is collapsed by default; open it before IR interactions.
  async function expandRuleEntry() {
    fireEvent.click(screen.getByText('用一句话填写规则'));
    await screen.findByLabelText('策略描述');
  }

  test('offers a ranked market reference and keeps actual cost and drawdown controls in advanced settings', async () => {
    render(<MemoryRouter><StrategyLab /></MemoryRouter>);

    expect(await screen.findByRole('button', { name: /贵州茅台/ })).toBeTruthy();
    expect(screen.queryByLabelText('手续费')).toBeNull();
    fireEvent.click(screen.getByText('高级：均线、费用与风控参数'));
    expect(screen.getByText('东方财富证券 A 股参考')).toBeTruthy();
    expect((screen.getByLabelText('手续费') as HTMLInputElement).value).toBe('2.5');
    expect((screen.getByLabelText('回撤止损') as HTMLInputElement).value).toBe('0');

    fireEvent.click(screen.getByRole('button', { name: /贵州茅台/ }));
    await waitFor(() => expect((screen.getByLabelText('股票代码') as HTMLInputElement).value).toBe('SH600519'));
  });

  test('maps the risk-control goal to the existing steady preset without running', async () => {
    render(<MemoryRouter><StrategyLab /></MemoryRouter>);
    await screen.findByRole('button', { name: /贵州茅台/ });

    fireEvent.click(screen.getByRole('button', { name: '选择风险控制' }));
    fireEvent.click(screen.getByText('高级：均线、费用与风控参数'));

    expect((screen.getByLabelText('短均线') as HTMLInputElement).value).toBe('30');
    expect((screen.getByLabelText('长均线') as HTMLInputElement).value).toBe('90');
    expect((screen.getByLabelText('回撤止损') as HTMLInputElement).value).toBe('12');
  });

  test('prefills a symbol passed from a watchlist backtest link', async () => {
    render(<MemoryRouter initialEntries={['/strategy-lab/ma-crossover?symbol=sh600519']}><StrategyLab /></MemoryRouter>);

    expect((screen.getByLabelText('股票代码') as HTMLInputElement).value).toBe('sh600519');
  });

  test('prefills symbol, validated MA parameters, and the strategy prompt from a Knowledge link', async () => {
    render(<MemoryRouter initialEntries={['/strategy-lab/ma-crossover?symbol=600519&short_window=8&long_window=24&prompt=%E5%8F%8C%E5%9D%87%E7%BA%BF%E7%AD%96%E7%95%A5']}><StrategyLab /></MemoryRouter>);

    expect((screen.getByLabelText('股票代码') as HTMLInputElement).value).toBe('600519');
    fireEvent.click(screen.getByText('高级：均线、费用与风控参数'));
    expect((screen.getByLabelText('短均线') as HTMLInputElement).value).toBe('8');
    expect((screen.getByLabelText('长均线') as HTMLInputElement).value).toBe('24');
    await expandRuleEntry();
    expect((screen.getByLabelText('策略描述') as HTMLTextAreaElement).value).toBe('双均线策略');
  });

  test('restores an owner-checked Thesis intent, carries only the ticker, and never runs', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: {
      schema_version: 'thesis-validation-experiment/v1',
      source: { type: 'thesis', id: 7, title: '需求修复论文', ticker: '600519' },
      capability: 'backtests.ma_crossover',
      fixed_semantics: {
        frequency: '1d', price_field: 'close', signal_at: 'close',
        execute_at: 'next_open', position_mode: 'long_only',
      },
      parameters: { symbol: '600519' },
      requires_confirmation: ['short_window', 'long_window', 'start_date', 'initial_capital'],
      result_interpretation: 'VALIDATION_ONLY_NOT_CAUSAL_PROOF',
    } } as never);

    render(<MemoryRouter initialEntries={['/strategy-lab/ma-crossover?validation_thesis_id=7']}><StrategyLab /></MemoryRouter>);

    expect(await screen.findByText('来自 Thesis：需求修复论文')).toBeTruthy();
    expect(screen.getByText(/只带入标的 600519/)).toBeTruthy();
    expect(screen.getByText(/仍需确认：short_window、long_window、start_date、initial_capital/)).toBeTruthy();
    expect(screen.getByRole('link', { name: '返回来源 Thesis' }).getAttribute('href')).toBe('/thesis?id=7');
    expect((screen.getByLabelText('股票代码') as HTMLInputElement).value).toBe('600519');
    expect(createBacktest).not.toHaveBeenCalled();
    expect(saveBacktest).not.toHaveBeenCalled();
  });

  test('shows a tampered validation intent URL as an error without fetching or running', async () => {
    render(<MemoryRouter initialEntries={['/strategy-lab/ma-crossover?validation_thesis_id=bad']}><StrategyLab /></MemoryRouter>);

    expect(await screen.findByText('验证实验来源不可用')).toBeTruthy();
    expect(screen.getByText(/验证实验来源无效/)).toBeTruthy();
    expect(apiClient.get).not.toHaveBeenCalled();
    expect(createBacktest).not.toHaveBeenCalled();
  });

  test('opens a saved run as the experiment baseline without running or saving', async () => {
    const saved: BacktestRun = {
      id: 32, symbol: 'AAPL', status: 'completed', is_saved: true,
      params: {
        symbol: 'AAPL', start_date: '2024-01-01', end_date: '2025-01-01',
        short_window: 20, long_window: 50, initial_capital: 100_000,
        commission_bps: 3, slippage_bps: 2, sell_stamp_duty_bps: 0,
        minimum_commission_cny: 0, max_drawdown_stop_pct: 0, benchmark: 'buy_and_hold',
      },
      metrics: {
        total_return: 0.1, annualized_return: 0.08, benchmark_return: 0.12,
        excess_return: -0.02, max_drawdown: -0.1, sharpe_ratio: 0.5,
        sortino_ratio: 0.6, calmar_ratio: 0.7, information_ratio: 0.1,
        win_rate: 0.5, profit_factor: 1.2, turnover: 2, trade_count: 6,
      },
    };
    vi.mocked(listBacktests).mockResolvedValueOnce([saved]);
    vi.mocked(fetchInstrumentBars).mockRejectedValueOnce(new Error('无法获取 AAPL 的 K 线'));

    render(<MemoryRouter><StrategyLab /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: '打开实验' }));

    expect(await screen.findByText('当前参数与基准相同')).toBeTruthy();
    expect(await screen.findByText('部分证据不可用')).toBeTruthy();
    expect(screen.getByText('数据状态：回测完成，部分证据不可用')).toBeTruthy();
    expect(screen.getByTestId('preset-standard').textContent).toContain('+10.00%');
    expect(screen.queryByTestId('backtest-charts')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: '权益曲线' }));
    expect(screen.getByTestId('backtest-charts')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: '交易' }));
    expect(screen.queryByTestId('backtest-charts')).toBeNull();
    expect(screen.getByTestId('trades-table')).toBeTruthy();
    expect(saveBacktest).not.toHaveBeenCalled();
  });

  test('previews a saved experiment privately without publishing or rerunning', async () => {
    const saved: BacktestRun = {
      id: 33, symbol: 'AAPL', status: 'completed', is_saved: true,
      params: {
        symbol: 'AAPL', start_date: '2024-01-01', end_date: '2025-01-01',
        short_window: 20, long_window: 50, initial_capital: 100_000,
        commission_bps: 3, slippage_bps: 2, sell_stamp_duty_bps: 0,
        minimum_commission_cny: 0, max_drawdown_stop_pct: 0, benchmark: 'buy_and_hold',
      },
      metrics: {
        total_return: 0.1, annualized_return: 0.08, benchmark_return: 0.12,
        excess_return: -0.02, max_drawdown: -0.1, sharpe_ratio: 0.5,
        sortino_ratio: 0.6, calmar_ratio: 0.7, information_ratio: 0.1,
        win_rate: 0.5, profit_factor: 1.2, turnover: 2, trade_count: 6,
      },
    };
    vi.mocked(listBacktests).mockResolvedValueOnce([saved]);
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: {
      schema_version: 'share-preview/v1', visibility: 'private', published: false,
      publish_action_available: false, generated_at: '2026-08-13T16:00:00Z',
      object: { type: 'strategy_backtest', id: 33, title: 'AAPL experiment', subject_id: 'AAPL', status: 'completed' },
      content: { result_kind: 'COMPUTED_RESULT', causal_proof: false, method: 'cost-aware-ma-crossover-backtest', metrics: { total_return: 0.1 } },
      provenance: { provider: 'fixture', as_of: '2025-01-01', quality_flags: [], license_scope: null, license_status: 'UNKNOWN', public_reuse_permitted: false },
      audit: {
        provenance: { status: 'PARTIAL' }, freshness: { status: 'KNOWN' },
        license: { status: 'UNKNOWN' }, quality: { status: 'OK' },
        redaction: { status: 'PASS', redacted_count: 0, redacted_field_paths: [], output_scan_passed: true },
        disclaimer: { status: 'PRESENT', text: 'Private research preview only.' },
      },
      publication_gate: { status: 'BLOCKED', reasons: ['LICENSE_UNKNOWN'], requires: 'AIOS-071 decision' },
    } } as never);

    render(<MemoryRouter><StrategyLab /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: '私有分享预览' }));

    expect(await screen.findByText('私有分享预览 · 未发布')).toBeTruthy();
    expect(screen.getByText('COMPUTED_RESULT')).toBeTruthy();
    expect(apiClient.get).toHaveBeenCalledWith('/backtests/33/share-preview');
    expect(createBacktest).not.toHaveBeenCalled();
    expect(saveBacktest).not.toHaveBeenCalled();
  });

  test('renders empty and valid finite IR states without running a backtest', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: {
      status: 'valid',
      ir: {
        schema_version: 'strategy-ir/v1', strategy_type: 'ma_crossover',
        instrument: { symbol: '600519' }, data: { frequency: '1d', price_field: 'close' },
        conditions: [
          { id: 'entry', left: { indicator: 'sma', window: 20, price_field: 'close' }, operator: 'crosses_above', right: { indicator: 'sma', window: 50, price_field: 'close' }, explanation: '收盘价 MA20 上穿 MA50 后，目标仓位变为 long。', target_position: 'long' },
          { id: 'exit', left: { indicator: 'sma', window: 20, price_field: 'close' }, operator: 'crosses_below', right: { indicator: 'sma', window: 50, price_field: 'close' }, explanation: '收盘价 MA20 下穿 MA50 后，目标仓位变为 flat。', target_position: 'flat' },
        ],
        execution: { signal_at: 'close', execute_at: 'next_open', position_mode: 'long_only' },
        requires_confirmation: ['start_date', 'commission_bps'], canonical_key: 'a'.repeat(64),
      },
    } } as never);
    render(<MemoryRouter><StrategyLab /></MemoryRouter>);

    // The one-sentence rule entry starts collapsed so the form/results lead the page.
    expect(screen.queryByLabelText('策略描述')).toBeNull();
    await expandRuleEntry();

    expect(screen.getByText('尚未输入或解析策略描述')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('策略描述'), { target: { value: '明确的双均线策略' } });
    fireEvent.click(screen.getByRole('button', { name: '解析为有限 IR' }));

    expect(await screen.findByText('已生成不可执行 IR，尚未运行回测')).toBeTruthy();
    expect(screen.getByText('600519')).toBeTruthy();
    expect(screen.getByText(/MA20 上穿 MA50/)).toBeTruthy();
    expect(createBacktest).not.toHaveBeenCalled();
  });

  test('explicitly compiles and applies only mapped IR fields without running or saving', async () => {
    const ir = {
      schema_version: 'strategy-ir/v1', strategy_type: 'ma_crossover',
      instrument: { symbol: '600519' }, data: { frequency: '1d', price_field: 'close' },
      conditions: [
        { id: 'entry', left: { indicator: 'sma', window: 10, price_field: 'close' }, operator: 'crosses_above', right: { indicator: 'sma', window: 30, price_field: 'close' }, explanation: '收盘价 MA10 上穿 MA30 后，目标仓位变为 long。', target_position: 'long' },
        { id: 'exit', left: { indicator: 'sma', window: 10, price_field: 'close' }, operator: 'crosses_below', right: { indicator: 'sma', window: 30, price_field: 'close' }, explanation: '收盘价 MA10 下穿 MA30 后，目标仓位变为 flat。', target_position: 'flat' },
      ],
      execution: { signal_at: 'close', execute_at: 'next_open', position_mode: 'long_only' },
      requires_confirmation: ['start_date', 'initial_capital', 'commission_bps', 'benchmark'],
      canonical_key: 'b'.repeat(64),
    };
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce({ data: { status: 'valid', ir } } as never)
      .mockResolvedValueOnce({ data: { status: 'valid', draft: {
        schema_version: 'ma-crossover-draft/v1', source_ir_version: 'strategy-ir/v1',
        source_canonical_key: 'b'.repeat(64), capability: 'backtests.ma_crossover',
        parameters: { symbol: '600519', short_window: 10, long_window: 30 },
        data: { frequency: '1d', price_field: 'close' },
        execution: { signal_at: 'close', execute_at: 'next_open', position_mode: 'long_only' },
        requires_confirmation: ['start_date', 'initial_capital', 'commission_bps', 'benchmark'],
      } } } as never);
    render(<MemoryRouter><StrategyLab /></MemoryRouter>);
    await expandRuleEntry();

    fireEvent.change(screen.getByLabelText('策略描述'), { target: { value: '明确策略' } });
    fireEvent.click(screen.getByRole('button', { name: '解析为有限 IR' }));
    fireEvent.click(await screen.findByRole('button', { name: '应用到回测参数' }));

    expect(await screen.findByText('已应用标的与均线参数，尚未运行回测')).toBeTruthy();
    expect((screen.getByLabelText('股票代码') as HTMLInputElement).value).toBe('600519');
    fireEvent.click(screen.getByText('高级：均线、费用与风控参数'));
    expect((screen.getByLabelText('短均线') as HTMLInputElement).value).toBe('10');
    expect((screen.getByLabelText('长均线') as HTMLInputElement).value).toBe('30');
    expect(screen.getByText(/仍需确认：start_date、initial_capital、commission_bps、benchmark/)).toBeTruthy();
    expect(apiClient.post).toHaveBeenNthCalledWith(2, '/backtests/strategy-ir/compile', { ir });
    expect(createBacktest).not.toHaveBeenCalled();
    expect(saveBacktest).not.toHaveBeenCalled();
  });

  test('keeps invalid and request-error states distinct', async () => {
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce({ data: {
        status: 'invalid', code: 'strategy_ir_invalid',
        issues: [{ field: 'execution', code: 'missing', message: '必须明确收盘确认、下一交易日开盘执行。' }],
      } } as never)
      .mockRejectedValueOnce(new Error('解析服务暂时不可用'));
    render(<MemoryRouter><StrategyLab /></MemoryRouter>);
    await expandRuleEntry();
    const input = screen.getByLabelText('策略描述');

    fireEvent.change(input, { target: { value: '缺少执行时点' } });
    fireEvent.click(screen.getByRole('button', { name: '解析为有限 IR' }));
    expect(await screen.findByText('描述不够明确或超出当前能力')).toBeTruthy();
    expect(screen.getByText(/必须明确收盘确认/)).toBeTruthy();

    fireEvent.change(input, { target: { value: '再次解析' } });
    fireEvent.click(screen.getByText('解析为有限 IR'));
    expect(await screen.findByText('策略描述解析失败')).toBeTruthy();
    expect(screen.getByText('解析服务暂时不可用')).toBeTruthy();
  });
});
