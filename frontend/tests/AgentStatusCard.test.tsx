// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import AgentStatusCard from '../src/components/AgentStatusCard';
import { LanguageProvider } from '../src/i18n/LanguageContext';

describe('AgentStatusCard', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  test('renders a running stage and evidence count', () => {
    render(<LanguageProvider><AgentStatusCard name="估值 Agent" role="价值分析" status="running" stage="读取财报" evidenceCount={3} /></LanguageProvider>);

    expect(screen.getByText('正在核对')).toBeTruthy();
    expect(screen.getByText('读取财报')).toBeTruthy();
    expect(screen.getByText('3 条证据')).toBeTruthy();
  });

  test('keeps an agent failure visible', () => {
    render(<LanguageProvider><AgentStatusCard name="风控 Agent" status="failed" error="上游不可用" /></LanguageProvider>);

    expect(screen.getByText('失败，可继续')).toBeTruthy();
    expect(screen.getByText('上游不可用')).toBeTruthy();
  });
});
