// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import StatusChip from '../src/components/StatusChip';
import { LanguageProvider } from '../src/i18n/LanguageContext';

describe('StatusChip', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  test('uses the neutral class by default', () => {
    render(<LanguageProvider><StatusChip label="待确认" /></LanguageProvider>);

    expect(screen.getByText('待确认').className).toContain('status-chip--neutral');
  });

  test('renders the requested semantic tone', () => {
    render(<LanguageProvider><StatusChip label="失败" tone="error" /></LanguageProvider>);

    expect(screen.getByText('失败').className).toContain('status-chip--error');
  });
});
