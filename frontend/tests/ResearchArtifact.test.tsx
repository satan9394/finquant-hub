// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ResearchArtifact from '../src/components/ResearchArtifact';
import { LanguageProvider } from '../src/i18n/LanguageContext';

localStorage.setItem('finquant_lang', 'zh');

describe('ResearchArtifact', () => {
  it('renders state, summary, body, actions, and provenance footer', () => {
    render(
      <LanguageProvider>
        <ResearchArtifact type="Thesis" state="partial" title="长期假设" summary="仍需补证" version="v2" asOf="2026-08-30" actions={<button>导出</button>}>
          <span>正文内容</span>
        </ResearchArtifact>
      </LanguageProvider>,
    );

    expect(screen.getByText('投资论文')).toBeTruthy();
    expect(screen.getByText('部分完成')).toBeTruthy();
    expect(screen.getByText('仍需补证')).toBeTruthy();
    expect(screen.getByText('正文内容')).toBeTruthy();
    expect(screen.getByText(/版本 v2 · 截至 2026-08-30/)).toBeTruthy();
  });

  it('caps visible evidence chips at three', () => {
    const evidence = Array.from({ length: 4 }, (_, index) => ({ id: `${index}`, kind: 'FACT' as const, title: `证据 ${index}`, source: `source-${index}` }));
    render(<LanguageProvider><ResearchArtifact title="报告" evidence={evidence} /></LanguageProvider>);

    expect(within(screen.getByLabelText('关键证据')).getAllByRole('button').length).toBe(3);
    expect(screen.queryByText('source-3')).toBeNull();
  });
});
