// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import GlobalTaskEntry from '../src/components/GlobalTaskEntry';
import { globalCommandIntent, globalTaskPath, isLikelyTicker } from '../src/features/globalTaskEntry';
import { searchStocks } from '../src/services/stockApi';
import { LanguageProvider } from '../src/i18n/LanguageContext';

vi.mock('../src/services/stockApi', () => ({ searchStocks: vi.fn() }));
vi.mock('../src/services/researchApi', () => ({ listResearchWorkspaces: vi.fn().mockResolvedValue([]) }));

describe('global task entry', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('finquant_lang', 'zh');
    vi.mocked(searchStocks).mockResolvedValue([
      { code: '600519', name: '贵州茅台', market: 'A股', type: 'stock' },
    ]);
  });

  it('builds prefill-only destinations without submitting work', () => {
    expect(globalTaskPath('analysis', { code: '600519', name: '贵州茅台' })).toBe('/analysis/600519?autorun=0');
    expect(globalTaskPath('backtest', { code: '600519', name: '贵州茅台' })).toBe('/strategy-lab/ma-crossover?symbol=600519');
    expect(globalTaskPath('portfolio', { code: '600519', name: '贵州茅台' })).toBe('/portfolio?code=600519&name=%E8%B4%B5%E5%B7%9E%E8%8C%85%E5%8F%B0');
    expect(globalTaskPath('thesis', { code: '600519', name: '贵州茅台' })).toBe('/research?mode=thesis&new=1&ticker=600519');
    expect(globalTaskPath('question', null, '这家公司护城河如何？')).toBe('/research?prompt=%E8%BF%99%E5%AE%B6%E5%85%AC%E5%8F%B8%E6%8A%A4%E5%9F%8E%E6%B2%B3%E5%A6%82%E4%BD%95%EF%BC%9F');
    expect(globalCommandIntent('比较贵州茅台和五粮液最近三年的 ROIC')?.path).toContain('/compare?query=');
    expect(globalCommandIntent('监控长鑫科技 IPO 进展，每12小时检查一次')?.path).toContain('/alerts?draft=');
    expect(globalCommandIntent('筛选过去3年ROE>15%的A股')?.path).toContain('/discover?query=');
    expect(globalCommandIntent('回测贵州茅台 MA20/MA50 过去5年')?.path).toContain('/strategy-lab/ma-crossover?prompt=');
    expect(globalCommandIntent('600519')).toBeNull();
    expect(globalTaskPath('research', { code: 'BRK.B', name: 'Berkshire Hathaway' })).toBe('/research/BRK-B');
    expect(isLikelyTicker('BRK.B')).toBe(true);
    expect(isLikelyTicker('0700')).toBe(true);
    expect(isLikelyTicker('830799')).toBe(false);
    expect(isLikelyTicker('backtest')).toBe(false);
    expect(isLikelyTicker('研究苹果公司')).toBe(false);
  });

  it('searches, selects a target, and navigates only after an explicit task click', async () => {
    const onNavigate = vi.fn();
    render(<LanguageProvider><GlobalTaskEntry onNavigate={onNavigate} /></LanguageProvider>);

    fireEvent.click(screen.getByRole('button', { name: '打开全局命令栏' }));
    expect(screen.getByText(/不会自动调用模型/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /模型|MCP|设置/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('证券代码、公司名称或研究任务'), { target: { value: '茅台' } });
    fireEvent.click(screen.getByRole('button', { name: '识别意图' }));

    fireEvent.click(await screen.findByRole('button', { name: '选择 贵州茅台 600519' }));
    expect(onNavigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '分析股票' }));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('/analysis/600519?autorun=0'));
  }, 15_000);
});
