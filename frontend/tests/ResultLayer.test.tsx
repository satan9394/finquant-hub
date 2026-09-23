// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ResultLayer from '../src/components/ResultLayer';

describe('ResultLayer', () => {
  it('keeps summary, evidence, and method in a stable semantic order', () => {
    const { container } = render(
      <div>
        <ResultLayer layer="summary"><div>一句话结论</div></ResultLayer>
        <ResultLayer layer="evidence"><div>图表证据</div></ResultLayer>
        <ResultLayer layer="method"><div>参数与来源</div></ResultLayer>
      </div>,
    );

    expect(screen.getByRole('region', { name: '摘要' }).textContent).toContain('一句话结论');
    expect(screen.getByRole('region', { name: '证据' }).textContent).toContain('图表证据');
    expect(screen.getByRole('region', { name: '方法与来源' }).textContent).toContain('参数与来源');
    expect([...container.querySelectorAll('[data-result-layer]')].map((node) => node.getAttribute('data-result-layer')))
      .toEqual(['summary', 'evidence', 'method']);
  });
});
