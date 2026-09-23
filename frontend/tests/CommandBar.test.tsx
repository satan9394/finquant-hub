// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CommandBar from '../src/components/CommandBar';
import { GLOBAL_TASK_OPEN_EVENT } from '../src/components/GlobalTaskEntry';
import { LanguageProvider } from '../src/i18n/LanguageContext';

localStorage.setItem('finquant_lang', 'zh');

vi.mock('../src/components/GlobalTaskEntry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/components/GlobalTaskEntry')>();
  return {
    ...actual,
    default: ({ onNavigate }: { onNavigate: (path: string) => void }) => (
      <button onClick={() => onNavigate('/research/600519')}>mock command</button>
    ),
  };
});

describe('CommandBar', () => {
  it('renders its hero variant and accessible current context', () => {
    const { container } = render(<LanguageProvider><CommandBar variant="hero" context="贵州茅台" onNavigate={() => undefined} /></LanguageProvider>);

    expect(container.querySelector('.command-bar--hero')).toBeTruthy();
    expect(screen.getByLabelText('当前上下文：贵州茅台')).toBeTruthy();
  });

  it('forwards navigation from the shared task entry', () => {
    const onNavigate = vi.fn();
    render(<LanguageProvider><CommandBar onNavigate={onNavigate} /></LanguageProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'mock command' }));
    expect(onNavigate).toHaveBeenCalledWith('/research/600519');
  });

  it('renders only a trigger button in triggerOnly mode and opens the single global modal via event', () => {
    const onNavigate = vi.fn();
    const opened = vi.fn();
    window.addEventListener(GLOBAL_TASK_OPEN_EVENT, opened);
    const { container } = render(<LanguageProvider><CommandBar variant="hero" triggerOnly onNavigate={onNavigate} /></LanguageProvider>);

    // BACKLOG-032 Step A：triggerOnly 不内嵌第二个可弹窗 GlobalTaskEntry 实例，
    // 只渲染"输入框形态"触发按钮；点击 dispatch 全局打开事件，由 header 唯一
    // 实例弹起同一弹窗。
    expect(container.querySelector('.global-task-entry-trigger')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'mock command' })).toBeNull();
    // triggerOnly 触发按钮沿用 command.open 可访问名（与 header 弹窗宿主一致），
    // 8000 ticker-input E2E 依赖该名称从首页点开全局弹窗。
    fireEvent.click(screen.getByRole('button', { name: '打开全局命令栏' }));
    expect(opened).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();
    window.removeEventListener(GLOBAL_TASK_OPEN_EVENT, opened);
  });
});
