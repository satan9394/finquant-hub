// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import MonitorCard from '../src/components/MonitorCard';
import { LanguageProvider } from '../src/i18n/LanguageContext';

describe('MonitorCard', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  test('renders monitor facts and preserves unknown gaps', () => {
    render(<LanguageProvider><MonitorCard monitor={{ id: 1, name: '茅台估值监控', type: 'fundamental', priority: 'high', state: 'RUNNING', sources: 2 }} /></LanguageProvider>);

    expect(screen.getByRole('heading', { name: '茅台估值监控' })).toBeTruthy();
    expect(screen.getByText('基本面')).toBeTruthy();
    expect(screen.getByText('HIGH')).toBeTruthy();
    expect(screen.getAllByText('UNKNOWN').length).toBeGreaterThan(2);
  });

  test('dispatches inspect, run, and edit actions', () => {
    const onInspect = vi.fn();
    const onRunNow = vi.fn();
    const onEdit = vi.fn();
    render(<LanguageProvider><MonitorCard monitor={{ id: 2, name: '新闻监控', type: 'news' }} onInspect={onInspect} onRunNow={onRunNow} onEdit={onEdit} /></LanguageProvider>);

    fireEvent.click(screen.getByRole('button', { name: /检\s*查/ }));
    fireEvent.click(screen.getByRole('button', { name: '立即运行' }));
    fireEvent.click(screen.getByRole('button', { name: /编\s*辑/ }));
    expect(onInspect).toHaveBeenCalledOnce();
    expect(onRunNow).toHaveBeenCalledOnce();
    expect(onEdit).toHaveBeenCalledOnce();
  });
});
