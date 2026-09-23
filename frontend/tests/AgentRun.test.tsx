// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import AgentRun from '../src/components/AgentRun';
import { LanguageProvider } from '../src/i18n/LanguageContext';

const steps = [{ title: '读取证据', status: 'process' as const }];

describe('AgentRun', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  test('renders honest unknowns and disables unsupported actions', () => {
    render(<LanguageProvider><AgentRun title="深度研究" progress={null} steps={[]} /></LanguageProvider>);

    expect(screen.getAllByText('UNKNOWN').length).toBeGreaterThan(0);
    expect((screen.getByRole('button', { name: /^暂\s*停$/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '调整范围' }) as HTMLButtonElement).disabled).toBe(true);
  });

  test('shows active progress and invokes supported actions', () => {
    const onPause = vi.fn();
    const onChangeScope = vi.fn();
    render(<LanguageProvider><AgentRun title="深度研究" progress={60} steps={steps} sources={4} activity="核对财报" onPause={onPause} onChangeScope={onChangeScope} /></LanguageProvider>);

    expect(screen.getByText('60%')).toBeTruthy();
    expect(screen.getByText('运行中')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^暂\s*停$/ }));
    fireEvent.click(screen.getByRole('button', { name: '调整范围' }));
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onChangeScope).toHaveBeenCalledTimes(1);
  });
});
