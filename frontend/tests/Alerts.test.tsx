// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import Alerts from '../src/pages/Alerts';

const mocks = vi.hoisted(() => ({
  fetchSignalTypes: vi.fn(),
  fetchRules: vi.fn(),
  createRule: vi.fn(),
  updateRule: vi.fn(),
  deleteRule: vi.fn(),
  fetchTriggers: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock('../src/services/api', () => ({ default: { post: mocks.apiPost } }));

vi.mock('../src/services/alertApi', () => ({
  fetchAlertSignalTypes: mocks.fetchSignalTypes,
  fetchAlertRules: mocks.fetchRules,
  createAlertRule: mocks.createRule,
  updateAlertRule: mocks.updateRule,
  deleteAlertRule: mocks.deleteRule,
  fetchAlertTriggers: mocks.fetchTriggers,
}));

const rule = {
  id: 1,
  name: '苹果金叉',
  ticker: 'usAAPL',
  signal_type: 'golden_cross',
  direction: 'bullish' as const,
  is_enabled: true,
  created_at: '2026-07-29T10:00:00Z',
  updated_at: '2026-07-29T10:00:00Z',
};

const trigger = {
  id: 7,
  rule_id: 1,
  rule_name: '苹果金叉',
  ticker: 'usAAPL',
  signal_type: 'golden_cross',
  direction: 'bullish' as const,
  confidence: 'high' as const,
  signal_date: '2026-07-29',
  description: 'MA20 上穿 MA50',
  notification_id: 3,
  created_at: '2026-07-29T10:30:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchSignalTypes.mockResolvedValue(['*', 'golden_cross', 'death_cross']);
  mocks.fetchRules.mockResolvedValue([rule]);
  mocks.fetchTriggers.mockResolvedValue([trigger]);
  mocks.createRule.mockResolvedValue(rule);
  mocks.updateRule.mockResolvedValue(rule);
  mocks.deleteRule.mockResolvedValue(undefined);
  mocks.apiPost.mockResolvedValue({ data: {
    status: 'READY', ready_to_confirm: true, confirmation_key: 'abc',
    target: { title: '需求修复论文', ticker: 'sh600519' },
    condition: { signal_type: '*', source: 'user_selection', quality_status: 'UNKNOWN' },
    execution_boundary: '确认前不创建或启用规则。',
  } });
});

function renderPage(initialEntry = '/alerts') {
  return render(<MemoryRouter initialEntries={[initialEntry]}><Alerts /></MemoryRouter>);
}

describe('Alert center', () => {
  test('shows rule management and filtered trigger history', async () => {
    renderPage();

    expect(await screen.findByText('苹果金叉')).toBeTruthy();
    expect(screen.getByText('均线金叉')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: '触发历史' }));

    expect(await screen.findByText('MA20 上穿 MA50')).toBeTruthy();
    expect(screen.getByText('高')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('标的'), { target: { value: 'AAPL' } });
    fireEvent.click(screen.getByRole('button', { name: /查\s*询/ }));

    await waitFor(() => expect(mocks.fetchTriggers).toHaveBeenLastCalledWith({
      rule_id: undefined,
      ticker: 'AAPL',
      limit: 50,
    }));
  });

  test('creates a rule and sends an explicit null direction', async () => {
    renderPage();
    await screen.findByText('苹果金叉');

    fireEvent.click(screen.getByRole('button', { name: /新增规则/ }));
    await screen.findByText('任意技术信号');
    fireEvent.change(screen.getByLabelText('规则名称'), { target: { value: '腾讯突破' } });
    fireEvent.change(screen.getByLabelText('股票代码'), { target: { value: '0700.HK' } });
    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }));

    await waitFor(() => expect(mocks.createRule).toHaveBeenCalledWith({
      name: '腾讯突破',
      ticker: '0700.HK',
      signal_type: '*',
      direction: null,
      is_enabled: true,
    }));
  });

  test('toggles a rule without rewriting the rest of it', async () => {
    renderPage();
    await screen.findByText('苹果金叉');

    fireEvent.click(screen.getByRole('switch', { name: '苹果金叉启用状态' }));
    await waitFor(() => expect(mocks.updateRule).toHaveBeenCalledWith(1, { is_enabled: false }));
  });

  test('prefills thesis context without creating a rule', async () => {
    renderPage('/alerts?new=1&ticker=600519&thesis=7&name=%E9%9C%80%E6%B1%82%E4%BF%AE%E5%A4%8D%E8%AE%BA%E6%96%87%20%C2%B7%20%E6%8A%80%E6%9C%AF%E4%BF%A1%E5%8F%B7%E6%A0%B8%E9%AA%8C');

    expect(await screen.findByText('投资论文 #7')).toBeTruthy();
    expect(screen.getByDisplayValue('需求修复论文 · 技术信号核验')).toBeTruthy();
    expect(screen.getByDisplayValue('600519')).toBeTruthy();
    expect(screen.getByText(/当前预警表不保存论文外键/)).toBeTruthy();
    expect(mocks.createRule).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /生成草稿/ })).toBeTruthy();
  });

  test('shows portfolio risk evidence as prefill context without creating a rule', async () => {
    renderPage('/alerts?new=1&ticker=600519&name=%E6%B5%8B%E8%AF%95%E7%BB%84%E5%90%88%20%C2%B7%20%E9%9B%86%E4%B8%AD%E5%BA%A6%E5%A4%8D%E6%A0%B8&source=portfolio&portfolio=%E6%B5%8B%E8%AF%95%E7%BB%84%E5%90%88&metric=concentration&value=50.00%25&as_of=2026-08-07');

    expect(await screen.findByText('来源：测试组合风险体检')).toBeTruthy();
    expect(screen.getByText(/集中度 · 当前值 50.00% · 数据截至 2026-08-07/)).toBeTruthy();
    expect(screen.getByText(/保存后创建的仍是技术信号规则/)).toBeTruthy();
    expect(mocks.createRule).not.toHaveBeenCalled();
  });
});
