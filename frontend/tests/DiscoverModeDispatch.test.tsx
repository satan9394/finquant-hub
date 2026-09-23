// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import Discover from '../src/pages/Discover';

// AlphaResearchPanel 内部调用 fetchAlphaCatalog（走 apiClient）——在 jsdom 中 mock 为成功空目录，
// 避免真实网络；同时验证 mode=alpha 分发确实渲染面板而非筛选 UI。
vi.mock('../src/services/api', () => ({
  default: {
    get: vi.fn(async () => ({ data: { categories: [], templates: [], catalogue: { mode: 'FINQUANT_STARTER', source: 'mock', field_count: 0, data_status: 'PARTIAL' } } })),
    post: vi.fn(async () => ({ data: { items: [], errors: [] } })),
  },
}));

vi.mock('../src/services/alphaApi', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/services/alphaApi')>();
  return {
    ...original,
    fetchAlphaCatalog: vi.fn(async () => ({
      categories: [],
      templates: [],
      catalogue: { mode: 'FINQUANT_STARTER', source: 'mock', field_count: 0, data_status: 'PARTIAL' },
    })),
    searchAlpha: vi.fn(async () => []),
  };
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/discover" element={<Discover />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Discover mode dispatch', () => {
  test('?mode=alpha renders the Alpha research workbench instead of the screening UI', async () => {
    renderAt('/discover?mode=alpha');
    expect(await screen.findByTestId('alpha-research')).toBeTruthy();
    expect(screen.queryByText(/正在读取|尚未选择模板/)).toBeTruthy();
    // 筛选专用搜索入口不应出现在 alpha 工作台（DiscoverSearch 的占位文案不在面板中）
    expect(screen.queryByPlaceholderText(/证券|ticker|代码/i)).toBeNull();
  });

  test('default mode keeps the screening/discovery UI', () => {
    renderAt('/discover');
    expect(screen.queryByTestId('alpha-research')).toBeNull();
    expect(screen.getByRole('heading', { name: /发现|Discover|discover/i })).toBeTruthy();
  });
});
