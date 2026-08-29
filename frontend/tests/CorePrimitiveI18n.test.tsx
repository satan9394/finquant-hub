// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import DecisionCard from '../src/components/DecisionCard';
import FinancialMetric from '../src/components/FinancialMetric';
import ResearchArtifact from '../src/components/ResearchArtifact';
import { LanguageProvider } from '../src/i18n/LanguageContext';

describe('shared financial primitives i18n', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'en'));

  test('renders decision, artifact, and metric boundaries in English', () => {
    render(
      <LanguageProvider>
        <DecisionCard
          type="risk"
          title="Margin pressure"
          whyNow="Gross margin changed"
          impact="High"
          quality="PARTIAL"
        />
        <ResearchArtifact title="Draft report" state="draft" />
        <FinancialMetric label="ROIC" value={null} quality="UNKNOWN" />
      </LanguageProvider>,
    );

    expect(screen.getByText('Risk')).toBeTruthy();
    expect(screen.getByText('Impact: High')).toBeTruthy();
    expect(screen.getByText('Research Report')).toBeTruthy();
    expect(screen.getAllByText('Draft').length).toBeGreaterThan(0);
    expect(screen.getByText('Unknown')).toBeTruthy();
    expect(screen.getByText(/Methodology pending · As of UNKNOWN/)).toBeTruthy();
  });
});
