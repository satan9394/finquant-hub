// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentModeSelector from '../src/components/AgentModeSelector';
import AgentRun from '../src/components/AgentRun';
import CompareGrid from '../src/components/CompareGrid';
import EntityHeader from '../src/components/EntityHeader';
import EvidenceCard from '../src/components/EvidenceCard';
import InvestmentCommittee from '../src/components/InvestmentCommittee';
import MetricStrip from '../src/components/MetricStrip';
import ThesisBlock from '../src/components/ThesisBlock';
import { LanguageProvider } from '../src/i18n/LanguageContext';

const wrap = (node: React.ReactNode) => render(<LanguageProvider>{node}</LanguageProvider>);

describe('Research OS components', () => {
  beforeEach(() => localStorage.setItem('finquant_lang', 'zh'));

  it('renders an entity header, source-linked metrics, and all four agent modes', () => {
    const onReference = vi.fn();
    const onMode = vi.fn();
    wrap(<>
      <EntityHeader name="贵州茅台" ticker="600519" price="1291.50" change="-1.25%" changeTone="down" onWatch={vi.fn()} onMonitor={vi.fn()} onCompare={vi.fn()} />
      <MetricStrip items={[{ key: 'price', label: '价格', value: '1291.50', sourceRef: 1 }]} onReference={onReference} />
      <AgentModeSelector value="analyst" onChange={onMode} />
    </>);
    expect(screen.getByRole('heading', { name: '贵州茅台' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '[1]' }));
    expect(onReference).toHaveBeenCalledWith(1);
    expect(screen.getByText('快速')).toBeTruthy();
    expect(screen.getByText('分析师')).toBeTruthy();
    expect(screen.getByText('深度研究')).toBeTruthy();
    expect(screen.getByText('审查')).toBeTruthy();
  }, 15_000);

  it('keeps absent thesis fields honest and exposes research plan controls', () => {
    wrap(<>
      <ThesisBlock thesis={{ stance: null, conviction: null, core: [], evidenceFor: [], evidenceAgainst: [], catalysts: [], invalidationRules: [] }} />
      <AgentRun title="Deep Research" progress={null} steps={[{ title: '检索来源', status: 'wait' }]} />
    </>);
    expect(screen.getAllByText('UNKNOWN').length).toBeGreaterThan(4);
    expect((screen.getByRole('button', { name: /暂\s*停/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '调整范围' }) as HTMLButtonElement).disabled).toBe(true);
  }, 15_000);

  it('disables evidence actions that have no real callback or document URL', () => {
    wrap(<EvidenceCard evidence={{ id: 1, title: '行情快照' }} />);
    expect((screen.getByRole('button', { name: '打开文档' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '加入 Thesis' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables Add to Thesis only when the workspace provides a real draft action', () => {
    const onAdd = vi.fn();
    wrap(<EvidenceCard evidence={{ id: 1, title: '行情快照' }} onAdd={onAdd} />);
    fireEvent.click(screen.getByRole('button', { name: '加入 Thesis' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('renders comparison actions and review structure instead of a chat transcript', () => {
    wrap(<>
      <CompareGrid leftName="贵州茅台" rightName="五粮液" rows={[{ key: 'roic', metric: 'ROIC', left: 'UNKNOWN', right: 'UNKNOWN' }]} />
      <InvestmentCommittee topic="估值审查" phase="completed" members={[
        { key: 'risk', name: 'Risk Agent', role: '风险', status: 'completed', position: '看空', summary: '库存证据不足' },
        { key: 'industry', name: 'Industry Agent', role: '行业', status: 'completed', position: '看多', summary: '需求恢复' },
      ]} />
    </>);
    expect(screen.getByRole('button', { name: '询问 Agent' })).toBeTruthy();
    expect(screen.getAllByText('共识').length).toBeGreaterThan(0);
    expect(screen.getAllByText('分歧').length).toBeGreaterThan(0);
    expect(screen.getAllByText('证据冲突').length).toBeGreaterThan(0);
  }, 15_000);

  it('renders the research decision components in English through translation keys', () => {
    localStorage.setItem('finquant_lang', 'en');
    wrap(<>
      <EntityHeader name="Moutai" ticker="600519" onWatch={vi.fn()} onMonitor={vi.fn()} onCompare={vi.fn()} />
      <ThesisBlock thesis={{ stance: 'Neutral', conviction: 50, core: [], evidenceFor: [], evidenceAgainst: [], catalysts: [], invalidationRules: [] }} />
      <EvidenceCard evidence={{ id: 1, title: 'Annual report' }} />
      <CompareGrid leftName="Moutai" rightName="Wuliangye" rows={[{ key: 'roic', metric: 'ROIC', left: 'UNKNOWN', right: 'UNKNOWN' }]} />
      <InvestmentCommittee topic="Valuation review" phase="completed" members={[
        { key: 'risk', name: 'Risk Agent', role: 'Risk', status: 'completed', position: '看空' },
      ]} />
    </>);
    expect(screen.getByText('Entity research case')).toBeTruthy();
    expect(screen.getByText('Current stance')).toBeTruthy();
    expect(screen.getByText('Authority')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ask Agent' })).toBeTruthy();
    expect(screen.getByText('Consensus')).toBeTruthy();
    expect(screen.getByText(/1\/1 completed agents are Bearish/)).toBeTruthy();
  }, 15_000);
});
