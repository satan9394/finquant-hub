// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ThesisBlock from '../src/components/ThesisBlock';
import { LanguageProvider } from '../src/i18n/LanguageContext';

localStorage.setItem('finquant_lang', 'zh');

const emptyThesis = { stance: null, conviction: null, core: [], evidenceFor: [], evidenceAgainst: [], catalysts: [], invalidationRules: [] };

describe('ThesisBlock', () => {
  it('keeps all missing thesis fields explicitly UNKNOWN', () => {
    render(<LanguageProvider><ThesisBlock thesis={emptyThesis} /></LanguageProvider>);

    expect(screen.getByText('当前立场')).toBeTruthy();
    expect(screen.getAllByText('UNKNOWN').length).toBeGreaterThanOrEqual(7);
  });

  it('renders evidence and invokes the source-reference callback', () => {
    const onReference = vi.fn();
    render(
      <LanguageProvider>
        <ThesisBlock thesis={{ ...emptyThesis, stance: 'Bullish', conviction: 75, evidenceFor: [{ text: '自由现金流改善', sourceRef: 12 }] }} onReference={onReference} />
      </LanguageProvider>,
    );

    expect(screen.getByText('Bullish')).toBeTruthy();
    expect(screen.getByText('75%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '[12]' }));
    expect(onReference).toHaveBeenCalledWith(12);
  });
});
