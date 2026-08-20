// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ResearchIntentPicker from '../src/components/research/ResearchIntentPicker';
import { researchIntentPath } from '../src/features/researchIntent';

describe('ResearchIntentPicker', () => {
  it('describes three distinct model-usage choices without starting them', () => {
    const navigate = vi.fn();
    render(<ResearchIntentPicker symbol="600519" onNavigate={navigate} />);

    expect(screen.getByText('快速问答')).toBeTruthy();
    expect(screen.getByText('深度研究')).toBeTruthy();
    expect(screen.getByText('多视角审查')).toBeTruthy();
    expect(screen.getAllByText(/模型额度/)).toHaveLength(3);
    expect(screen.getByText(/选择这里只导航和预填/)).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '选择深度研究' }));
    expect(navigate).toHaveBeenCalledWith('/research/reports?symbol=600519');
  });

  it('builds safe prefill-only routes for all intents', () => {
    expect(researchIntentPath('quick', 'AAPL')).toContain('/chat?prompt=');
    expect(researchIntentPath('deep', '00700.HK')).toBe('/research/reports?symbol=00700.HK');
    expect(researchIntentPath('review', '600519')).toContain('/discussion?topic=');
  });
});
