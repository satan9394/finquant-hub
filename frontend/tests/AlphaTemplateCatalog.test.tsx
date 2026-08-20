// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AlphaTemplateCatalog from '../src/components/alpha/AlphaTemplateCatalog';
import type { AlphaCategory, AlphaTemplate } from '../src/services/alphaApi';

const categories: AlphaCategory[] = [
  { name: 'Fundamental', count: 1652, examples: ['operating_income', 'equity'] },
  { name: 'Price Volume', count: 195, examples: ['close', 'volume'] },
];

const templateIds = [
  'fundamental_quality', 'free_cash_flow_yield', 'analyst_earnings_yield',
  'price_reversal', 'volume_price_divergence',
];
const templates: AlphaTemplate[] = templateIds.map((id, index) => ({
  id,
  name: ['基本面质量', '自由现金流收益率', '分析师盈利收益率', '短期价格反转', '量价背离'][index],
  expression: index === 0 ? 'group_rank(ts_rank(operating_income / equity, 126), subindustry)' : `expression_${index}`,
  fields: [{ id: index === 0 ? 'operating_income' : `field_${index}`, description: '真实目录字段', coverage: index === 0 ? 0.5 : undefined }],
  settings: { neutralization: 'INDUSTRY', decay: index, delay: 1, nanHandling: 'ON' },
}));

describe('AlphaTemplateCatalog', () => {
  it('shows real category counts, five templates, field coverage, and progressive formula disclosure', () => {
    const onSelect = vi.fn();
    render(<AlphaTemplateCatalog categories={categories} templates={templates} selectedId={null} onSelect={onSelect} />);

    expect(screen.getByTestId('alpha-category-Fundamental').textContent).toContain('1,652');
    expect(screen.getByText('基本面质量')).toBeTruthy();
    expect(screen.getByText('量价背离')).toBeTruthy();
    expect(screen.getAllByText('operating_income').length).toBeGreaterThan(0);
    expect(screen.getByText('目录 coverage 50.0%')).toBeTruthy();
    expect(screen.getAllByText('区域：接口未提供').length).toBe(5);

    fireEvent.click(screen.getAllByText('表达式与设置')[0]);
    expect(screen.getByText(/group_rank\(ts_rank/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '选择基本面质量模板' }));
    expect(onSelect).toHaveBeenCalledWith('fundamental_quality');
  });
});
