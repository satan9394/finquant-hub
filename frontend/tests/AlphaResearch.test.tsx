// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AlphaResearch from '../src/pages/AlphaResearch';
import { fetchAlphaCatalog, searchAlpha } from '../src/services/alphaApi';

vi.mock('../src/services/alphaApi', () => ({
  fetchAlphaCatalog: vi.fn(),
  searchAlpha: vi.fn(),
  simulateAlphaLocally: vi.fn(),
  correlateAlphaSeries: vi.fn(),
}));

describe('AlphaResearch', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(fetchAlphaCatalog).mockResolvedValue({
      categories: [{ name: 'Fundamental', count: 1652, examples: ['operating_income'] }],
      templates: [{
        id: 'fundamental_quality', name: '基本面质量',
        expression: 'group_rank(ts_rank(operating_income / equity, 126), subindustry)',
        fields: [{ id: 'operating_income', description: 'Operating income', coverage: 0.5 }],
        settings: { neutralization: 'SUBINDUSTRY', decay: 0, delay: 1, nanHandling: 'ON' },
      }],
      catalogue: {
        schema_version: 'alpha-catalogue/v1', mode: 'BUNDLED_EXTERNAL', data_status: 'OK',
        source: 'local_bundled_file', redistribution_status: 'UNKNOWN', field_count: 4367,
      },
    });
    vi.mocked(searchAlpha).mockResolvedValue([{
      name: 'Operating Income', field: 'operating_income', desc: 'Operating income field', type: 'wq_field',
    }]);
  });

  it('selects the real template referenced by the latest saved local study', async () => {
    localStorage.setItem('finquant_alpha_studies_v1', JSON.stringify([{
      id: 'alpha-1', savedAt: '2026-08-09T00:00:00.000Z', name: '已保存研究',
      templateId: 'fundamental_quality', templateName: '基本面质量', quantile: 0.2,
      periodsPerYear: 252, result: { equity_curve: [], period_returns: [], metrics: {} },
    }]));

    render(<MemoryRouter><AlphaResearch /></MemoryRouter>);

    expect(await screen.findByRole('button', { name: '当前模板：基本面质量' })).toBeTruthy();
    expect(screen.getByText('已保存研究')).toBeTruthy();
  });

  it('loads the real catalog, selects locally, and preserves explicit field search', async () => {
    render(<MemoryRouter><AlphaResearch /></MemoryRouter>);

    expect(await screen.findByText('基本面质量')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '选择基本面质量模板' }));
    expect(screen.getByRole('button', { name: '当前模板：基本面质量' })).toBeTruthy();
    expect(screen.getByText('当前模板：基本面质量')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText(/operating_income/), { target: { value: 'operating_income' } });
    fireEvent.click(screen.getByRole('button', { name: /检索/ }));
    await waitFor(() => expect(searchAlpha).toHaveBeenCalledWith('operating_income'));
    expect(await screen.findByText('Operating Income')).toBeTruthy();
  });

  it('restores and explicitly clears a preferred real catalog template', async () => {
    localStorage.setItem('finquant_professional_preferences_v1', JSON.stringify({
      version: 1, indicatorKeys: ['ma'], layoutDensity: 'compact', alphaTemplateId: 'fundamental_quality',
    }));

    render(<MemoryRouter><AlphaResearch /></MemoryRouter>);

    expect(await screen.findByRole('button', { name: '当前常用模板' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '清除常用模板' }));
    expect(JSON.parse(localStorage.getItem('finquant_professional_preferences_v1') || '{}').alphaTemplateId).toBeNull();
    expect(screen.getByRole('button', { name: '保存为常用模板' })).toBeTruthy();
  });

  it('does not save a selected template until the explicit action', async () => {
    render(<MemoryRouter><AlphaResearch /></MemoryRouter>);
    await screen.findByText('基本面质量');
    fireEvent.click(screen.getByRole('button', { name: '选择基本面质量模板' }));
    expect(localStorage.getItem('finquant_professional_preferences_v1')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '保存为常用模板' }));
    expect(JSON.parse(localStorage.getItem('finquant_professional_preferences_v1') || '{}').alphaTemplateId).toBe('fundamental_quality');
    expect(screen.getByRole('button', { name: '当前常用模板' })).toBeTruthy();
  });

  it('shows the distributable starter as PARTIAL instead of a full WorldQuant claim', async () => {
    vi.mocked(fetchAlphaCatalog).mockResolvedValueOnce({
      categories: [{ name: 'Fundamental', count: 3, examples: ['operating_income'] }],
      templates: [{
        id: 'fundamental_quality', name: '基本面质量', expression: 'group_rank(ts_rank(operating_income / equity, 126), subindustry)',
        fields: [{ id: 'operating_income', description: 'Project starter field', coverage: null }],
        settings: { neutralization: 'SUBINDUSTRY', decay: 0, delay: 1, nanHandling: 'ON' },
      }],
      catalogue: {
        schema_version: 'alpha-catalogue/v1', mode: 'FINQUANT_STARTER', data_status: 'PARTIAL',
        source: 'finquant.starter', redistribution_status: 'PROJECT_AUTHORED', field_count: 8,
      },
    });

    render(<MemoryRouter><AlphaResearch /></MemoryRouter>);

    expect(await screen.findByText('当前使用可分发 starter catalogue（PARTIAL）')).toBeTruthy();
    expect(screen.getByText(/coverage 保持 UNKNOWN/)).toBeTruthy();
    expect(screen.getByText(/不是 WorldQuant 完整目录/)).toBeTruthy();
  });
});
