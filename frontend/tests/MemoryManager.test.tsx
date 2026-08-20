// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import MemoryManager from '../src/components/MemoryManager';
import * as researchApi from '../src/services/researchApi';

vi.mock('../src/services/researchApi', () => ({
  fetchMemories: vi.fn(),
  actOnMemory: vi.fn(),
  deleteMemory: vi.fn(),
  exportMemories: vi.fn(),
}));

const candidate = {
  id: 7,
  subject_type: 'instrument',
  subject_id: 'usAAPL',
  memory_type: 'hypothesis',
  information_kind: 'AI_INFERENCE',
  content: { text: 'Services margin needs verification' },
  source_kind: 'ai',
  source_id: 'research_report:4',
  evidence_id: null,
  valid_from: null,
  valid_to: null,
  observed_at: null,
  status: 'candidate' as const,
  confidence: null,
  quality_flags: ['UNVERIFIED'],
  supersedes_id: null,
  created_at: '2026-08-11T00:00:00Z',
  updated_at: '2026-08-11T00:00:00Z',
};

describe('MemoryManager', () => {
  beforeEach(() => {
    vi.mocked(researchApi.fetchMemories).mockResolvedValue([candidate]);
    vi.mocked(researchApi.actOnMemory).mockResolvedValue({ ...candidate, status: 'confirmed' });
    vi.mocked(researchApi.deleteMemory).mockResolvedValue();
  });

  it('shows trust boundaries and confirms only after an explicit click', async () => {
    render(<MemoryManager />);

    expect(await screen.findByText('AI_INFERENCE')).toBeTruthy();
    expect(screen.getByText('待确认')).toBeTruthy();
    expect(screen.getByText(/来源：research_report:4 · 观察时间：UNKNOWN/)).toBeTruthy();
    expect(researchApi.actOnMemory).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /确\s*认/ }));
    await waitFor(() => expect(researchApi.actOnMemory).toHaveBeenCalledWith(7, { action: 'confirm' }));
  });

  it('edits by sending a new-version action', async () => {
    render(<MemoryManager />);
    await screen.findByText('待确认');

    fireEvent.click(screen.getByRole('button', { name: /编\s*辑/ }));
    fireEvent.change(screen.getByLabelText('编辑记忆 7'), {
      target: { value: '{"text":"User corrected"}' },
    });
    fireEvent.click(screen.getByRole('button', { name: /保\s*存\s*为\s*新\s*版\s*本/ }));

    await waitFor(() => expect(researchApi.actOnMemory).toHaveBeenCalledWith(7, {
      action: 'edit',
      content: { text: 'User corrected' },
    }));
  });
});
