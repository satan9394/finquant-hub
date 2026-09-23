// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Thesis from '../src/pages/Thesis';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));

vi.mock('../src/services/api', () => ({
  default: { get: mocks.get, post: mocks.post, put: mocks.put },
}));

const thesis = {
  id: 7,
  ticker: '600519',
  title: '需求修复论文',
  thesis: '现金流与需求需要继续核验',
  assumptions: ['需求逐步企稳'],
  status: 'open',
  source_report_id: 6,
  drift_status: 'unknown',
  updated_at: '2026-08-09 10:00:00',
  claims: [{ id: 1, claim: '价格相对创建时未显著走弱', kind: 'price', status: 'unknown', note: '' }],
  last_check: {
    engine_version: 'thesis-drift/v1',
    rules: {
      price: {
        rule_id: 'price.relative_change', rule_version: '1.0.0', status: 'violated',
        reason: '价格相对基准变化 +30.0%（阈值 20%）', formula: '(current - baseline) / abs(baseline)',
        parameters: { absolute_change_threshold: 0.2 }, baseline_value: 100, current_value: 130,
        baseline_evidence_ids: ['ev_price_base'], current_evidence_ids: ['ev_price_current'],
      },
      report: {
        rule_id: 'report.manual_review', rule_version: '1.0.0', status: 'unknown',
        reason: '报告变化需要人工复核', formula: null, parameters: {}, baseline_value: null,
        current_value: null, baseline_evidence_ids: [], current_evidence_ids: [],
      },
    },
  },
};

const versions = [{
  id: 12,
  version: 2,
  judgment: '现金流与需求需要继续核验',
  confidence: 0.7,
  change_reason: '新证据改变置信度',
  created_by: 'user',
  created_at: '2026-08-12 09:00:00',
  supporting_evidence_ids: ['ev_support_01'],
  opposing_evidence_ids: ['ev_oppose_01'],
  diff_from_previous: {
    confidence: { from: 0.4, to: 0.7, reason: '新证据改变置信度' },
  },
  confirmations: [{
    id: 22, decision: 'acknowledged', reason: '已核对来源证据', created_at: '2026-08-12 10:00:00',
  }],
}];

const reviews = [{
  id: 31,
  thesis_version_id: 12,
  status: 'pending',
  quality_status: 'PARTIAL',
  engine_version: 'thesis-drift/v1',
  changes: [{
    result_kind: 'COMPUTED_RESULT', claim_id: 1, kind: 'price',
    from_status: 'unknown', to_status: 'violated',
    reason: '价格相对基准变化 +30.0%', rule_id: 'price.relative_change', rule_version: '1.0.0',
    baseline_evidence_ids: ['ev_price_base'], current_evidence_ids: ['ev_price_current'],
  }],
  evidence_ids: ['ev_price_base', 'ev_price_current'],
  error: null,
  created_at: '2026-08-12 11:00:00',
  events: [{ id: 41, event_type: 'created', reason: 'deterministic change', created_at: '2026-08-12 11:00:00' }],
}, {
  id: 30,
  thesis_version_id: 12,
  status: 'failed',
  quality_status: 'UPSTREAM_ERROR',
  engine_version: null,
  changes: [],
  evidence_ids: [],
  error: 'RuntimeError: fixture upstream unavailable',
  created_at: '2026-08-12 10:30:00',
  events: [{ id: 40, event_type: 'check_failed', reason: 'RuntimeError: fixture upstream unavailable', created_at: '2026-08-12 10:30:00' }],
}];

const getResponse = (path: string) => {
  if (path === '/thesis') return { data: { items: [thesis] } };
  if (path === '/thesis/7/versions') return { data: { items: versions } };
  if (path === '/thesis/7/reviews') return { data: { items: reviews } };
  if (path === '/thesis/7/validation-experiment') return { data: {
    schema_version: 'thesis-validation-experiment/v1',
    source: { type: 'thesis', id: 7, title: thesis.title, ticker: thesis.ticker },
    parameters: { symbol: thesis.ticker }, requires_confirmation: ['short_window'],
  } };
  if (path === '/thesis/7/share-preview') return { data: {
    schema_version: 'share-preview/v1', visibility: 'private', published: false,
    publish_action_available: false, generated_at: '2026-08-13T16:00:00Z',
    object: { type: 'thesis', id: 7, title: thesis.title, subject_id: thesis.ticker, status: 'open' },
    content: { result_kind: 'USER_HYPOTHESIS', causal_proof: false, judgment: thesis.thesis },
    evidence: [],
    audit: {
      provenance: { status: 'UNKNOWN' }, freshness: { status: 'UNKNOWN' },
      license: { status: 'PRIVATE_DISPLAY_ONLY' }, quality: { status: 'UNKNOWN' },
      redaction: { status: 'PASS', redacted_count: 0, redacted_field_paths: [], output_scan_passed: true },
      disclaimer: { status: 'PRESENT', text: 'Private research preview only.' },
    },
    publication_gate: { status: 'BLOCKED', reasons: ['PRIVATE_PREVIEW_ONLY'], requires: 'AIOS-071 decision' },
  } };
  return { data: thesis };
};

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
};

describe('Thesis tracking handoff', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows source, explicit validation semantics, and an alert prefill link', async () => {
    mocks.get.mockImplementation((path: string) => Promise.resolve(getResponse(path)));

    render(<MemoryRouter initialEntries={['/thesis?id=7']}><Thesis /></MemoryRouter>);

    expect((await screen.findAllByText('现金流与需求需要继续核验')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('价格变化').length).toBeGreaterThan(0);
    expect(screen.getByText(/未知表示数据不可用/)).toBeTruthy();
    expect(screen.getByText('引擎版本：thesis-drift/v1')).toBeTruthy();
    expect(screen.getByText('price.relative_change@1.0.0')).toBeTruthy();
    expect(screen.getByText('公式：(current - baseline) / abs(baseline)')).toBeTruthy();
    expect(screen.getAllByText('基准证据：ev_price_base').length).toBeGreaterThan(0);
    expect(screen.getByText('公式：UNKNOWN / 人工复核')).toBeTruthy();
    expect(screen.getByText('版本历史与确认')).toBeTruthy();
    expect(screen.getByText('证据复盘工作流')).toBeTruthy();
    expect(screen.getByText('价格相对基准变化 +30.0%')).toBeTruthy();
    expect(screen.getByText('新证据：ev_price_current')).toBeTruthy();
    expect(screen.getAllByText('PARTIAL').length).toBeGreaterThan(0);
    expect(screen.getByText('核验失败 · UPSTREAM_ERROR')).toBeTruthy();
    expect(screen.getByText('变更：confidence')).toBeTruthy();
    expect(screen.getByText(/理由：新证据改变置信度/)).toBeTruthy();
    expect(screen.getByText('支持证据：ev_support_01')).toBeTruthy();
    expect(screen.getByText('反对证据：ev_oppose_01')).toBeTruthy();
    expect(screen.getByText('用户已确认')).toBeTruthy();
    expect(screen.getByRole('button', { name: '打开' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /查看来源报告 #6/ }).getAttribute('href')).toBe('/research/reports?symbol=600519&report=6');
    expect(screen.getByRole('link', { name: /设置技术预警/ }).getAttribute('href')).toContain('/alerts?new=1');
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('creates an owner-checked validation intent before navigating to Strategy Lab', async () => {
    mocks.get.mockImplementation((path: string) => Promise.resolve(getResponse(path)));

    render(
      <MemoryRouter initialEntries={['/thesis?id=7']}>
        <Routes>
          <Route path="/thesis" element={<Thesis />} />
          <Route path="/strategy-lab/ma-crossover" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findAllByText('现金流与需求需要继续核验', {}, { timeout: 5_000 });
    fireEvent.click(await screen.findByRole('button', { name: /创建验证实验/ }, { timeout: 5_000 }));

    expect((await screen.findByTestId('location')).textContent).toBe(
      '/strategy-lab/ma-crossover?validation_thesis_id=7',
    );
    expect(mocks.get).toHaveBeenCalledWith('/thesis/7/validation-experiment');
    expect(mocks.post).not.toHaveBeenCalled();
  }, 15_000);

  it('opens an owner-only private preview without publishing', async () => {
    mocks.get.mockImplementation((path: string) => Promise.resolve(getResponse(path)));
    render(<MemoryRouter initialEntries={['/thesis?id=7']}><Thesis /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: '私有分享预览' }));

    expect(await screen.findByText('私有分享预览 · 未发布')).toBeTruthy();
    expect(screen.getByText('公开门禁：BLOCKED')).toBeTruthy();
    expect(mocks.get).toHaveBeenCalledWith('/thesis/7/share-preview');
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('keeps validation intent authorization failures visible', async () => {
    mocks.get.mockImplementation((path: string) => path === '/thesis/7/validation-experiment'
      ? Promise.reject(new Error('论文不存在：id=7'))
      : Promise.resolve(getResponse(path)));

    render(<MemoryRouter initialEntries={['/thesis?id=7']}><Thesis /></MemoryRouter>);
    await screen.findAllByText('现金流与需求需要继续核验', {}, { timeout: 5_000 });
    fireEvent.click(await screen.findByRole('button', { name: /创建验证实验/ }, { timeout: 5_000 }));

    expect(await screen.findByText('创建验证实验失败')).toBeTruthy();
    expect(screen.getByText('论文不存在：id=7')).toBeTruthy();
  }, 15_000);

  it('runs an explicit evidence-linked challenge and keeps UNKNOWN gaps visible', async () => {
    mocks.get.mockImplementation((path: string) => Promise.resolve(getResponse(path)));
    mocks.post.mockResolvedValue({ data: {
      thesis_id: 7,
      ticker: '600519',
      generated_at: '2026-08-12T00:00:00Z',
      result_kind: 'AI_INFERENCE',
      overall_status: 'PARTIAL',
      strongest_counter_evidence: [{
        result_kind: 'AI_INFERENCE', quality_status: 'OK', claim_id: 1,
        claim: '价格相对创建时未显著走弱', summary: '当前反对证据需要核对适用性。',
        evidence_refs: [{ evidence_id: 'ev_counter_01', relation: 'opposing', kind: 'observed_fact', data_status: 'OK', source: 'fixture.primary', as_of: '2026-06-30', retrieved_at: '2026-08-12T00:00:00Z', quality_flags: [] }],
      }],
      omitted_variables: [{
        result_kind: 'AI_INFERENCE', quality_status: 'UNKNOWN', category: 'missing_disconfirmation',
        severity: 'medium', summary: '补充可观察的否决条件。', evidence_refs: [],
      }],
      fragile_assumptions: [{
        result_kind: 'AI_INFERENCE', quality_status: 'PARTIAL', assumption: '需求逐步企稳',
        summary: '只有版本级证据，尚无假设级映射。', evidence_refs: [],
      }],
      limitation: '只读取当前保存的 canonical evidence，不自动修改用户 Thesis。',
    } });

    render(<MemoryRouter initialEntries={['/thesis?id=7']}><Thesis /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /挑战我的论文/ }));

    expect(await screen.findByText('最强反证')).toBeTruthy();
    expect(screen.getByText('ev_counter_01')).toBeTruthy();
    expect(screen.getByText('fixture.primary · 2026-06-30')).toBeTruthy();
    expect(screen.getAllByText('AI 推论').length).toBeGreaterThan(0);
    expect(screen.getAllByText('UNKNOWN').length).toBeGreaterThan(0);
    expect(screen.getByText(/不自动修改用户 Thesis/)).toBeTruthy();
    expect(mocks.post).toHaveBeenCalledWith('/thesis/7/challenge');
  });

  it('shows a durable challenge error state', async () => {
    mocks.get.mockImplementation((path: string) => Promise.resolve(getResponse(path)));
    mocks.post.mockRejectedValue(new Error('challenge unavailable'));

    render(<MemoryRouter initialEntries={['/thesis?id=7']}><Thesis /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /挑战我的论文/ }));

    expect(await screen.findByText('challenge unavailable')).toBeTruthy();
  });

  it('requires a reason and appends an explicit version confirmation', async () => {
    mocks.get.mockImplementation((path: string) => Promise.resolve(getResponse(path)));
    mocks.post.mockResolvedValue({ data: { id: 23, decision: 'disputed', reason: '证据期限不匹配' } });

    render(<MemoryRouter initialEntries={['/thesis?id=7']}><Thesis /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: '提出争议' }));
    const confirmButton = screen.getByRole('button', { name: '追加记录' });
    expect((confirmButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('版本确认原因'), { target: { value: '证据期限不匹配' } });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith(
      '/thesis/7/versions/2/confirm',
      { decision: 'disputed', reason: '证据期限不匹配' },
    ));
  });

  it('requires an explicit reason and appends a review decision', async () => {
    mocks.get.mockImplementation((path: string) => Promise.resolve(getResponse(path)));
    mocks.post.mockResolvedValue({ data: { ...reviews[0], status: 'acknowledged' } });

    render(<MemoryRouter initialEntries={['/thesis?id=7']}><Thesis /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: '确认变化' }));
    const submit = screen.getByRole('button', { name: '追加复盘记录' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('复盘决定原因'), { target: { value: '已核对新证据适用期' } });
    fireEvent.click(submit);

    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith(
      '/thesis/7/reviews/31/decide',
      { decision: 'acknowledged', reason: '已核对新证据适用期' },
    ));
  });

  it('keeps review loading failures visible instead of showing an empty success state', async () => {
    mocks.get.mockImplementation((path: string) => path === '/thesis/7/reviews'
      ? Promise.reject(new Error('review history unavailable'))
      : Promise.resolve(getResponse(path)));

    render(<MemoryRouter initialEntries={['/thesis?id=7']}><Thesis /></MemoryRouter>);

    expect(await screen.findByText('review history unavailable')).toBeTruthy();
    expect(screen.getByText('加载复盘工作流失败')).toBeTruthy();
  });

  it('prefills a new Thesis draft with the evidence claim supplied by Evidence Rail', async () => {
    mocks.get.mockImplementation((path: string) => Promise.resolve(getResponse(path)));
    const claim = '当前行情快照: 贵州茅台 600519: 1418 · Market data';
    render(<MemoryRouter initialEntries={[`/research?mode=thesis&new=1&ticker=600519&claim=${encodeURIComponent(claim)}`]}><Thesis /></MemoryRouter>);

    const tickerInput = await screen.findByLabelText('股票代码') as HTMLInputElement;
    const claimsInput = screen.getByLabelText('手动论点（每行一条）') as HTMLTextAreaElement;
    expect(tickerInput.value).toBe('600519');
    expect(claimsInput.value).toBe(claim);
  });
});
