// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  DecisionInboxPanel, LocalCapabilityBanner, MarketSignalAvailability, type DecisionInboxItem,
} from '../src/pages/Dashboard';
import type { DashboardStats } from '../src/types';


const item: DecisionInboxItem = {
  id: 'thesis-claim-event:9',
  kind: 'thesis_claim_change',
  priority: 'high',
  why_now: '价格越过已保存阈值',
  occurred_at: '2026-08-12 08:00:00',
  object_ref: { type: 'thesis', id: 7, title: 'Apple Thesis', ticker: 'usAAPL', path: '/thesis?id=7' },
  evidence_refs: [{
    evidence_id: 'ev_price_current', kind: 'observed_fact', data_status: 'OK',
    source: 'fixture.market', as_of: '2026-08-12', retrieved_at: '2026-08-12T08:00:00Z',
  }],
  quality_status: 'OK',
  next_action: { kind: 'navigate', label: '复核论文与证据', path: '/thesis?id=7' },
};

describe('DecisionInboxPanel', () => {
  it('renders loading, error, and empty states explicitly', () => {
    const { rerender } = render(<DecisionInboxPanel items={[]} loading error="" onRetry={vi.fn()} onNavigate={vi.fn()} />);
    expect(document.querySelector('.ant-skeleton')).toBeTruthy();

    const retry = vi.fn();
    rerender(<DecisionInboxPanel items={[]} loading={false} error="upstream unavailable" onRetry={retry} onNavigate={vi.fn()} />);
    expect(screen.getByText('upstream unavailable')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));
    expect(retry).toHaveBeenCalledOnce();

    rerender(<DecisionInboxPanel items={[]} loading={false} error="" onRetry={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByText('今天没有需要复核的用户对象变化')).toBeTruthy();
  });

  it('shows why-now and routes evidence detail through the chip-opened drawer', () => {
    const navigate = vi.fn();
    render(<DecisionInboxPanel items={[item]} loading={false} error="" onRetry={vi.fn()} onNavigate={navigate} />);

    expect(screen.getByText('价格越过已保存阈值')).toBeTruthy();
    expect(screen.getByText('OK')).toBeTruthy();
    // BACKLOG-032 Step D：卡面不再平铺逐条 provenance（id/source/asOf/quality）；
    // 证据细节移入既有 EvidenceDrawer——点证据 chip 打开抽屉并展示同一信息。
    expect(screen.queryByText(/ev_price_current · fixture\.market · 2026-08-12 · OK/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /FACT，点击查看证据/ }));
    expect(screen.getByText(/fixture\.market/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '复核论文与证据' }));
    expect(navigate).toHaveBeenCalledWith('/thesis?id=7');
  });
});

const capabilities: DashboardStats['capabilities'] = {
  contract_version: 'local-capabilities/v1',
  runtime_mode: 'LOCAL_ONLY',
  local_core: { status: 'AVAILABLE', quality_status: 'OK' },
  model_ai: {
    status: 'UNCONFIGURED', quality_status: 'UNKNOWN', credential_source: 'none', model_id: 1, action_path: '/models',
  },
  market_data: { status: 'RUNTIME_CHECK_REQUIRED', quality_status: 'UNKNOWN' },
};

describe('LocalCapabilityBanner', () => {
  it('keeps missing model configuration non-blocking and links to the existing repair path', () => {
    const navigate = vi.fn();
    render(<LocalCapabilityBanner capabilities={capabilities} onNavigate={navigate} />);

    expect(screen.getByText('本地核心已可用，AI 模型尚未配置')).toBeTruthy();
    expect(screen.getByText(/模型：UNCONFIGURED \/ UNKNOWN/)).toBeTruthy();
    expect(screen.getByText(/行情：RUNTIME_CHECK_REQUIRED \/ UNKNOWN/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '配置模型' }));
    expect(navigate).toHaveBeenCalledWith('/models');
  });

  it('does not turn configured credentials into a connectivity claim', () => {
    render(<LocalCapabilityBanner
      capabilities={{ ...capabilities, model_ai: { ...capabilities.model_ai, status: 'CONFIGURED_UNVERIFIED', credential_source: 'environment' } }}
      onNavigate={vi.fn()}
    />);

    expect(screen.getByText('模型凭据已配置，连通性尚未验证')).toBeTruthy();
    expect(screen.getByText(/配置存在不等于上游可用/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '去模型管理测试' })).toBeTruthy();
  });
});

describe('MarketSignalAvailability', () => {
  it('keeps the unsupported cross-ticker aggregate UNKNOWN and offers a concrete analysis path', () => {
    const navigate = vi.fn();
    render(<MarketSignalAvailability onNavigate={navigate} />);

    expect(screen.getByText('UNKNOWN')).toBeTruthy();
    expect(screen.getByText('暂无可审计的跨标的信号汇总')).toBeTruthy();
    expect(screen.getByText(/UNKNOWN 不代表近期没有信号/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '分析示例 600519' }));
    expect(navigate).toHaveBeenCalledWith('/analysis/600519');
  });
});
