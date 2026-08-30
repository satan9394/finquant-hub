// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import SourceChip from '../src/components/SourceChip';
import { LanguageProvider } from '../src/i18n/LanguageContext';

describe('SourceChip', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  test('renders the provider and exposes provenance metadata', async () => {
    render(<LanguageProvider><SourceChip provider="Yahoo" asOf="2026-08-30" quality="OK" /></LanguageProvider>);

    const chip = screen.getByText('Yahoo');
    fireEvent.mouseEnter(chip);
    expect(await screen.findByText('as_of 2026-08-30 · quality OK')).toBeTruthy();
  });

  test('uses UNKNOWN when provider metadata is absent', () => {
    render(<LanguageProvider><SourceChip provider={null} /></LanguageProvider>);

    expect(screen.getByText('UNKNOWN')).toBeTruthy();
  });
});
