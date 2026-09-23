// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ResearchPlan from '../src/components/ResearchPlan';
import { LanguageProvider } from '../src/i18n/LanguageContext';

localStorage.setItem('finquant_lang', 'zh');

describe('ResearchPlan', () => {
  it('renders plan progress, steps, source count, and activity', () => {
    render(
      <LanguageProvider>
        <ResearchPlan title="财报研究" progress={50} sources={3} activity="核对利润" steps={[{ title: '读取财报', status: 'finish' }, { title: '形成结论', status: 'process' }]} />
      </LanguageProvider>,
    );

    expect(screen.getByText('财报研究')).toBeTruthy();
    expect(screen.getByText('运行中')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
    expect(screen.getByText('核对利润')).toBeTruthy();
  });

  it('invokes pause and scope callbacks while preserving UNKNOWN progress', () => {
    const onPause = vi.fn();
    const onChangeScope = vi.fn();
    render(<LanguageProvider><ResearchPlan title="研究" progress={null} steps={[]} onPause={onPause} onChangeScope={onChangeScope} /></LanguageProvider>);

    expect(screen.getAllByText('UNKNOWN').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /暂\s*停/ }));
    fireEvent.click(screen.getByRole('button', { name: '调整范围' }));
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onChangeScope).toHaveBeenCalledTimes(1);
  });
});
