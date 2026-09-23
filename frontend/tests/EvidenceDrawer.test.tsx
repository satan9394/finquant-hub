// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EvidenceDrawer from '../src/components/EvidenceDrawer';
import { LanguageProvider } from '../src/i18n/LanguageContext';

localStorage.setItem('finquant_lang', 'zh');

describe('EvidenceDrawer', () => {
  it('renders nothing when no evidence is selected', () => {
    const { container } = render(<LanguageProvider><EvidenceDrawer evidence={null} open onClose={() => undefined} /></LanguageProvider>);
    expect(container.innerHTML).toBe('');
  });

  it('shows provenance and toggles professional details', () => {
    render(
      <LanguageProvider>
        <EvidenceDrawer
          open
          onClose={vi.fn()}
          evidence={{ kind: 'FACT', quality: 'OK', title: '真实营收', detail: '来自财报', source: 'Annual Report', provider: 'issuer', asOf: '2025-12-31', formula: 'revenue' }}
        />
      </LanguageProvider>,
    );

    expect(screen.getByText('真实营收')).toBeTruthy();
    expect(screen.getByText('Annual Report')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '查看计算与技术详情' }));
    expect(screen.getByText('工具日志')).toBeTruthy();
    expect(screen.getByRole('button', { name: '收起计算与技术详情' })).toBeTruthy();
  });
});
