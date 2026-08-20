// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import SharePreviewModal from '../src/components/SharePreviewModal';
import type { SharePreview } from '../src/types/research';

const preview: SharePreview = {
  schema_version: 'share-preview/v1', visibility: 'private', published: false,
  publish_action_available: false, generated_at: '2026-08-13T16:00:00Z',
  object: { type: 'thesis', id: 7, title: '需求假设', subject_id: 'usAAPL', status: 'open' },
  content: {
    result_kind: 'USER_HYPOTHESIS', causal_proof: false, judgment: '需求可能修复',
    assumptions: ['库存下降'], claims: ['现金流改善'], invalidation_conditions: ['需求继续恶化'],
  },
  evidence: [{
    evidence_id: 'ev_share_001', relation: 'supporting', kind: 'observed_fact',
    data_status: 'PARTIAL', source: 'fixture', vendor: 'fixture',
    as_of: '2026-08-12', retrieved_at: '2026-08-13', quality_flags: ['DELAYED'],
    license_scope: 'display-and-research', public_reuse_permitted: false,
  }],
  audit: {
    provenance: { status: 'OK' }, freshness: { status: 'KNOWN' },
    license: { status: 'PRIVATE_DISPLAY_ONLY' }, quality: { status: 'PARTIAL' },
    redaction: { status: 'PASS', redacted_count: 1, redacted_field_paths: ['$.content.judgment'], output_scan_passed: true },
    disclaimer: { status: 'PRESENT', text: 'Private research preview only.' },
  },
  publication_gate: { status: 'BLOCKED', reasons: ['PRIVATE_PREVIEW_ONLY'], requires: 'AIOS-071 decision' },
};

describe('SharePreviewModal', () => {
  it('shows private provenance and blocking gates without publish, copy, or send actions', () => {
    const onClose = vi.fn();
    render(<SharePreviewModal open loading={false} error="" preview={preview} onClose={onClose} onRetry={vi.fn()} />);

    expect(screen.getByText('私有分享预览 · 未发布')).toBeTruthy();
    expect(screen.getByText('USER_HYPOTHESIS')).toBeTruthy();
    expect(screen.getByText('ev_share_001')).toBeTruthy();
    expect(screen.getByText(/display-and-research/)).toBeTruthy();
    expect(screen.getByText('公开门禁：BLOCKED')).toBeTruthy();
    expect(screen.getByText('Private research preview only.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /发布|复制|发送/ })).toBeNull();
    const closeButton = screen.getByRole('button', { name: /关\s*闭/ });
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders loading, error retry, and empty states', () => {
    const retry = vi.fn();
    const { rerender } = render(<SharePreviewModal open loading error="" preview={null} onClose={vi.fn()} onRetry={retry} />);
    expect(screen.getByText('正在生成私有预览')).toBeTruthy();

    rerender(<SharePreviewModal open loading={false} error="UPSTREAM_ERROR" preview={null} onClose={vi.fn()} onRetry={retry} />);
    expect(screen.getByText('私有预览生成失败')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));
    expect(retry).toHaveBeenCalledOnce();

    rerender(<SharePreviewModal open loading={false} error="" preview={null} onClose={vi.fn()} onRetry={retry} />);
    expect(screen.getByText('暂无可预览内容')).toBeTruthy();
  });
});
