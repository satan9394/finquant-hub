/* Portfolio page: groups, summary, holdings, allocation, and paper simulation. */
import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert, Card, Row, Col, Table, Tabs, Button, Modal, Form, Input, InputNumber, Select, Statistic, Typography, message, Empty, Popconfirm, Spin, Progress, Space, Tag,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined,
} from '@ant-design/icons';
import {
  fetchPortfolioGroups, fetchPortfolioSummary, fetchPortfolioHoldings,
  fetchPortfolioAllocation, createPortfolio, addPortfolioHolding, updatePortfolioHolding, deletePortfolioHolding,
} from '../services/analysisApi';
import apiClient from '../services/api';
import type {
  PaperPortfolio, PaperPortfolioValuation, PaperReviewContext, PaperReviewDraft,
  PortfolioGroup, PortfolioSummary,
  PortfolioHolding, PortfolioAllocation,
} from '../types';
import TaskPageHeader from '../components/TaskPageHeader';
import PortfolioRiskWorkbench from '../components/portfolio/PortfolioRiskWorkbench';
import FinancialMetric from '../components/FinancialMetric';
import PortfolioOverview from '../components/PortfolioOverview';
import { LoadStateView, readStateOf } from '../components/LoadFailureAlert';
import { useLanguage } from '../i18n/LanguageContext';

const { Text } = Typography;

type PortfolioLoadArea = 'groups' | 'summary' | 'holdings' | 'allocation';

// Value-color helpers.
const profitColor = (v?: number) => (v != null ? (v >= 0 ? 'var(--fq-price-up)' : 'var(--fq-price-down)') : 'var(--fq-text-secondary)');
const profitPrefix = (v?: number) => (v != null ? (v >= 0 ? '+' : '') : '');

export default function Portfolio() {
  const { t } = useLanguage();
  const loadAreaLabels: Record<PortfolioLoadArea, string> = {
    groups: t('portfolio.area.groups'),
    summary: t('portfolio.area.summary'),
    holdings: t('portfolio.area.holdings'),
    allocation: t('portfolio.area.allocation'),
  };
  const loadErrorText = (error: unknown) => error instanceof Error ? error.message : t('portfolio.requestFailed');
  const paperOutcomeLabel = {
    supported: t('portfolio.paper.outcome.supported'),
    refuted: t('portfolio.paper.outcome.refuted'),
    inconclusive: t('portfolio.paper.outcome.inconclusive'),
  };
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedCode = searchParams.get('code')?.trim().toUpperCase();
  const prefillHolding = requestedCode
    ? { code: requestedCode, name: searchParams.get('name')?.trim() || requestedCode, shares: undefined }
    : searchParams.get('example') === '600519'
      ? { code: '600519', name: t('portfolio.exampleName'), shares: 10 }
      : null;

  // Portfolio data.
  const [groups, setGroups] = useState<PortfolioGroup[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [allocation, setAllocation] = useState<PortfolioAllocation[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);
  const [holdingsResolved, setHoldingsResolved] = useState(false);
  const [holdingsResolvedGroupId, setHoldingsResolvedGroupId] = useState<number | null>(null);
  const [holdingsErrorGroupId, setHoldingsErrorGroupId] = useState<number | null>(null);

  // Loading state.
  const [loading, setLoading] = useState(true);
  const [loadErrors, setLoadErrors] = useState<Partial<Record<PortfolioLoadArea, string>>>({});

  // Portfolio modals.
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState<PortfolioHolding | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [form] = Form.useForm();
  const [portfolioModalOpen, setPortfolioModalOpen] = useState(false);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioForm] = Form.useForm();

  // Paper simulation state is fully separate from the real portfolio.
  const [paperItems, setPaperItems] = useState<PaperPortfolio[]>([]);
  const [activePaperId, setActivePaperId] = useState<number | null>(null);
  const [paperLoading, setPaperLoading] = useState(true);
  const [paperError, setPaperError] = useState<string | null>(null);
  const [paperValuation, setPaperValuation] = useState<PaperPortfolioValuation | null>(null);
  const [paperValuationLoading, setPaperValuationLoading] = useState(false);
  const [paperValuationError, setPaperValuationError] = useState<string | null>(null);
  const [paperCreateOpen, setPaperCreateOpen] = useState(false);
  const [paperLedgerOpen, setPaperLedgerOpen] = useState(false);
  const [paperReviewOpen, setPaperReviewOpen] = useState(false);
  const [paperActionLoading, setPaperActionLoading] = useState(false);
  const [paperReviewContext, setPaperReviewContext] = useState<PaperReviewContext | null>(null);
  const [paperReviewContextLoading, setPaperReviewContextLoading] = useState(false);
  const [paperReviewContextError, setPaperReviewContextError] = useState<string | null>(null);
  const [selectedHypothesisId, setSelectedHypothesisId] = useState<number | null>(null);
  const [paperReviewDraft, setPaperReviewDraft] = useState<PaperReviewDraft | null>(null);
  const [paperReviewDraftLoading, setPaperReviewDraftLoading] = useState(false);
  const [paperReviewDraftError, setPaperReviewDraftError] = useState<string | null>(null);
  const [paperCreateForm] = Form.useForm();
  const [paperLedgerForm] = Form.useForm();
  const [paperReviewForm] = Form.useForm();

  const setLoadError = useCallback((area: PortfolioLoadArea, error?: unknown) => {
    setLoadErrors((current) => {
      const next = { ...current };
      if (error == null) delete next[area];
      else next[area] = loadErrorText(error);
      return next;
    });
  }, []);

  // Load portfolio groups.
  const loadGroups = useCallback(async () => {
    try {
      const g = await fetchPortfolioGroups();
      setGroups(g);
      if (g.length > 0 && activeGroupId == null) {
        setActiveGroupId(g[0].id);
      } else if (g.length === 0) {
        setActiveGroupId(null);
        setHoldings([]);
        setHoldingsResolved(true);
        setHoldingsResolvedGroupId(null);
        setHoldingsErrorGroupId(null);
        setLoadError('holdings');
      }
      setLoadError('groups');
    } catch (error) {
      setLoadError('groups', error);
    }
  }, [activeGroupId, setLoadError]);

  // Load summary.
  const loadSummary = useCallback(async () => {
    try {
      const s = await fetchPortfolioSummary();
      setSummary(s);
      setLoadError('summary');
    } catch (error) {
      setLoadError('summary', error);
    }
  }, [setLoadError]);

  // Load holdings.
  const loadHoldings = useCallback(async (groupId?: number) => {
    try {
      const h = await fetchPortfolioHoldings(groupId);
      setHoldings(h);
      setHoldingsResolved(true);
      setHoldingsResolvedGroupId(groupId ?? null);
      setHoldingsErrorGroupId(null);
      setLoadError('holdings');
    } catch (error) {
      setHoldingsErrorGroupId(groupId ?? null);
      setLoadError('holdings', error);
    }
  }, [setLoadError]);

  // Load allocation.
  const loadAllocation = useCallback(async () => {
    try {
      const a = await fetchPortfolioAllocation();
      setAllocation(a);
      setLoadError('allocation');
    } catch (error) {
      setLoadError('allocation', error);
    }
  }, [setLoadError]);

  // Initial load.
  useEffect(() => {
    setLoading(true);
    Promise.all([loadGroups(), loadSummary(), loadAllocation()])
      .finally(() => setLoading(false));
  }, [loadGroups, loadSummary, loadAllocation]);

  const loadPaperPortfolios = useCallback(async () => {
    setPaperLoading(true);
    setPaperError(null);
    try {
      const response = await apiClient.get<{ items: PaperPortfolio[] }>('/portfolio/paper');
      setPaperItems(response.data.items);
      setActivePaperId((current) => (
        current != null && response.data.items.some((item) => item.id === current)
          ? current
          : response.data.items.find((item) => item.status === 'ACTIVE')?.id
            ?? response.data.items[0]?.id
            ?? null
      ));
    } catch (error) {
      setPaperError(loadErrorText(error));
    } finally {
      setPaperLoading(false);
    }
  }, []);

  const loadPaperValuation = useCallback(async (paperId: number) => {
    setPaperValuationLoading(true);
    setPaperValuationError(null);
    try {
      const response = await apiClient.get<PaperPortfolioValuation>(`/portfolio/paper/${paperId}/valuation`);
      setPaperValuation(response.data);
    } catch (error) {
      setPaperValuation(null);
      setPaperValuationError(loadErrorText(error));
    } finally {
      setPaperValuationLoading(false);
    }
  }, []);

  const loadPaperReviewContext = useCallback(async (paperId: number) => {
    setPaperReviewContextLoading(true);
    setPaperReviewContextError(null);
    try {
      const response = await apiClient.get<PaperReviewContext>(`/portfolio/paper/${paperId}/reviews`);
      setPaperReviewContext(response.data);
      setSelectedHypothesisId((current) => (
        current != null && response.data.hypotheses.some((item) => item.id === current)
          ? current
          : response.data.hypotheses[0]?.id ?? null
      ));
    } catch (error) {
      setPaperReviewContext(null);
      setPaperReviewContextError(loadErrorText(error));
    } finally {
      setPaperReviewContextLoading(false);
    }
  }, []);

  const loadPaperReviewDraft = useCallback(async (paperId: number, hypothesisId: number) => {
    setPaperReviewDraftLoading(true);
    setPaperReviewDraftError(null);
    try {
      const response = await apiClient.get<PaperReviewDraft>(
        `/portfolio/paper/${paperId}/reviews/draft?hypothesis_memory_id=${hypothesisId}`,
      );
      setPaperReviewDraft(response.data);
    } catch (error) {
      setPaperReviewDraft(null);
      setPaperReviewDraftError(loadErrorText(error));
    } finally {
      setPaperReviewDraftLoading(false);
    }
  }, []);

  useEffect(() => { void loadPaperPortfolios(); }, [loadPaperPortfolios]);

  useEffect(() => {
    setPaperReviewDraft(null);
    setPaperReviewDraftError(null);
    if (activePaperId != null) {
      void loadPaperValuation(activePaperId);
      void loadPaperReviewContext(activePaperId);
    } else {
      setPaperValuation(null);
      setPaperReviewContext(null);
    }
  }, [activePaperId, loadPaperReviewContext, loadPaperValuation]);

  // Refresh holdings when the active group changes.
  useEffect(() => {
    if (activeGroupId != null) loadHoldings(activeGroupId);
  }, [activeGroupId, loadHoldings]);

  // Create or edit a holding.
  const openAddModal = () => {
    setEditingHolding(null);
    form.resetFields();
    form.setFieldsValue({ group_id: activeGroupId ?? groups[0]?.id });
    setModalOpen(true);
  };

  const prefillRequestedHolding = (groupId: number) => {
    if (!prefillHolding) return;
    setEditingHolding(null);
    form.resetFields();
    form.setFieldsValue({
      group_id: groupId,
      code: prefillHolding.code,
      name: prefillHolding.name,
      shares: prefillHolding.shares,
    });
    setModalOpen(true);
  };

  const openExample = () => {
    if (!prefillHolding) return;
    const groupId = activeGroupId ?? groups[0]?.id;
    if (groupId != null) {
      prefillRequestedHolding(groupId);
      return;
    }
    portfolioForm.setFieldsValue({ name: t('portfolio.defaultName'), currency: 'CNY' });
    setPortfolioModalOpen(true);
  };

  const openEditModal = (holding: PortfolioHolding) => {
    setEditingHolding(holding);
    form.setFieldsValue({
      group_id: holding.group_id,
      code: holding.code,
      name: holding.name,
      shares: holding.shares,
      cost_price: holding.cost_price,
    });
    setModalOpen(true);
  };

  const handleCreatePortfolio = async () => {
    try {
      const values = await portfolioForm.validateFields();
      setPortfolioLoading(true);
      const group = await createPortfolio(values);
      setPortfolioModalOpen(false);
      portfolioForm.resetFields();
      await loadGroups();
      setActiveGroupId(group.id);
      prefillRequestedHolding(group.id);
      message.success(t('portfolio.created'));
    } catch (err: any) {
      if (err.message) message.error(err.message);
    } finally {
      setPortfolioLoading(false);
    }
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      setModalLoading(true);
      if (editingHolding) {
        await updatePortfolioHolding(editingHolding.id, values);
        message.success(t('portfolio.holdingUpdated'));
      } else {
        await addPortfolioHolding(values);
        message.success(t('portfolio.holdingAdded'));
      }
      setModalOpen(false);
      loadHoldings(activeGroupId ?? undefined);
      loadSummary();
      loadAllocation();
    } catch (err: any) {
      if (err.message) message.error(err.message);
    } finally {
      setModalLoading(false);
    }
  };

  // Delete a holding.
  const handleDelete = async (id: number) => {
    try {
      await deletePortfolioHolding(id);
      message.success(t('portfolio.deleted'));
      loadHoldings(activeGroupId ?? undefined);
      loadSummary();
      loadAllocation();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const handleCreatePaper = async () => {
    try {
      const values = await paperCreateForm.validateFields();
      setPaperActionLoading(true);
      const response = await apiClient.post<PaperPortfolio>('/portfolio/paper', values);
      setPaperCreateOpen(false);
      paperCreateForm.resetFields();
      await loadPaperPortfolios();
      setActivePaperId(response.data.id);
      message.success(t('portfolio.paper.created'));
    } catch (error: any) {
      if (error?.message) message.error(error.message);
    } finally {
      setPaperActionLoading(false);
    }
  };

  const openPaperLedger = () => {
    const selected = paperItems.find((item) => item.id === activePaperId);
    paperLedgerForm.resetFields();
    paperLedgerForm.setFieldsValue({
      side: 'BUY',
      fee: 0,
      currency: selected?.base_currency ?? 'CNY',
      simulation_as_of: new Date().toISOString(),
    });
    setPaperLedgerOpen(true);
  };

  const handleAppendPaperLedger = async () => {
    if (activePaperId == null) return;
    try {
      const values = await paperLedgerForm.validateFields();
      const baseCurrency = paperItems.find((item) => item.id === activePaperId)?.base_currency;
      if (baseCurrency && values.currency !== baseCurrency
        && (!values.fx_rate_to_base || !values.fx_source || !values.fx_as_of)) {
        message.error(t('portfolio.paper.fxRequired', { currency: values.currency, baseCurrency }));
        return;
      }
      setPaperActionLoading(true);
      await apiClient.post(`/portfolio/paper/${activePaperId}/ledger`, values);
      setPaperLedgerOpen(false);
      paperLedgerForm.resetFields();
      await Promise.all([loadPaperPortfolios(), loadPaperValuation(activePaperId)]);
      message.success(t('portfolio.paper.ledgerAdded'));
    } catch (error: any) {
      if (error?.message) message.error(error.message);
    } finally {
      setPaperActionLoading(false);
    }
  };

  const handleArchivePaper = async () => {
    if (activePaperId == null) return;
    try {
      setPaperActionLoading(true);
      await apiClient.post(`/portfolio/paper/${activePaperId}/archive`);
      await loadPaperPortfolios();
      message.success(t('portfolio.paper.archived'));
    } catch (error: any) {
      message.error(error?.message || t('portfolio.paper.archiveFailed'));
    } finally {
      setPaperActionLoading(false);
    }
  };

  const openPaperReview = () => {
    if (!paperReviewDraft) return;
    paperReviewForm.resetFields();
    paperReviewForm.setFieldsValue({
      hypothesis_memory_id: paperReviewDraft.hypothesis.id,
    });
    setPaperReviewOpen(true);
  };

  const handleSavePaperReview = async () => {
    if (activePaperId == null) return;
    try {
      const values = await paperReviewForm.validateFields();
      setPaperActionLoading(true);
      await apiClient.post(`/portfolio/paper/${activePaperId}/reviews`, values);
      setPaperReviewOpen(false);
      paperReviewForm.resetFields();
      await loadPaperReviewContext(activePaperId);
      message.success(t('portfolio.paper.reviewRecorded'));
    } catch (error: any) {
      if (error?.message) message.error(error.message);
    } finally {
      setPaperActionLoading(false);
    }
  };

  // Summary cards.
  const summaryCards = summary ? [
    { key: 'invested', title: t('portfolio.metric.invested'), value: summary.total_invested, prefix: '¥', precision: 2, color: 'var(--fq-ai-primary)' },
    { key: 'value', title: t('portfolio.metric.value'), value: summary.total_current, prefix: '¥', precision: 2, color: 'var(--fq-evidence-model)' },
    { key: 'pnl', title: t('portfolio.metric.pnl'), value: summary.total_profit, prefix: '¥', precision: 2, color: profitColor(summary.total_profit) },
    { key: 'return', title: t('portfolio.metric.return'), value: summary.total_profit_percent, suffix: '%', precision: 2, color: profitColor(summary.total_profit_percent) },
  ] : [];

  // Holdings table columns.
  const columns = [
    { title: t('portfolio.column.code'), dataIndex: 'code', key: 'code', width: 90, render: (v: string) => <Text code>{v}</Text> },
    { title: t('portfolio.column.name'), dataIndex: 'name', key: 'name', width: 100 },
    { title: t('portfolio.column.shares'), dataIndex: 'shares', key: 'shares', width: 100, align: 'right' as const, render: (v: number) => v.toLocaleString() },
    { title: t('portfolio.column.cost'), dataIndex: 'cost_price', key: 'cost_price', width: 100, align: 'right' as const, render: (v: number) => `¥${v.toFixed(2)}` },
    { title: t('portfolio.column.price'), dataIndex: 'current_price', key: 'current_price', width: 100, align: 'right' as const, render: (v?: number) => v != null ? `¥${v.toFixed(2)}` : '--' },
    {
      title: t('portfolio.column.pnl'), dataIndex: 'profit', key: 'profit', width: 120, align: 'right' as const,
      render: (_: any, record: PortfolioHolding) => {
        const p = record.profit;
        const pp = record.profit_percent;
        return (
          <span style={{ color: profitColor(p), fontWeight: 600 }}>
            {p != null ? `${profitPrefix(p)}¥${p.toFixed(2)}` : '--'}
            {pp != null ? ` (${profitPrefix(pp)}${pp.toFixed(2)}%)` : ''}
          </span>
        );
      },
      sorter: (a: PortfolioHolding, b: PortfolioHolding) => (a.profit ?? 0) - (b.profit ?? 0),
    },
    {
      title: t('portfolio.column.actions'), key: 'action', width: 270,
      render: (_: any, record: PortfolioHolding) => (
        <Space wrap size={2}>
          <Button type="link" size="small" onClick={() => navigate(`/research/${encodeURIComponent(record.code)}`)}>{t('portfolio.action.research')}</Button>
          <Button type="link" size="small" onClick={() => navigate(`/research/${encodeURIComponent(record.code)}?mode=thesis`)}>{t('portfolio.thesisAction')}</Button>
          <Button type="link" size="small" onClick={() => navigate(`/alerts?new=1&ticker=${encodeURIComponent(record.code)}`)}>{t('portfolio.action.monitor')}</Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>{t('portfolio.action.edit')}</Button>
          <Popconfirm title={t('portfolio.deleteConfirm')} onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>{t('portfolio.action.delete')}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const activeGroupName = groups.find((group) => group.id === activeGroupId)?.name;
  const holdingsGroupKey = activeGroupId ?? null;
  const holdingsState = readStateOf({
    failed: loadErrors.holdings != null && holdingsErrorGroupId === holdingsGroupKey,
    resolved: holdingsResolved && holdingsResolvedGroupId === holdingsGroupKey,
    count: holdingsResolvedGroupId === holdingsGroupKey ? holdings.length : 0,
    error: loadErrors.holdings,
  });
  const portfolioHeader = (
    <TaskPageHeader
      eyebrow={t('portfolio.eyebrow')}
      title={t('portfolio.title')}
      goal={t('portfolio.goal')}
      object={activeGroupName || (groups.length ? t('portfolio.allGroups') : t('portfolio.noGroup'))}
      status={loading ? t('portfolio.status.loading') : summary ? t('portfolio.status.updated') : groups.length ? t('portfolio.status.waiting') : t('portfolio.status.empty')}
      statusTone={loading ? 'loading' : summary ? 'success' : 'neutral'}
      actions={!loading ? (
        <>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setPortfolioModalOpen(true)}>{t('portfolio.create')}</Button>
          <Button icon={<ReloadOutlined />} onClick={() => { loadSummary(); loadHoldings(activeGroupId ?? undefined); loadAllocation(); }}>
            {t('portfolio.refresh')}
          </Button>
        </>
      ) : undefined}
    />
  );

  // Render.
  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        {portfolioHeader}
        <div style={{ textAlign: 'center', padding: 64 }}><Spin size="large" /></div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {portfolioHeader}

      {Object.entries(loadErrors).filter(([area]) => area !== 'holdings').map(([area, error]) => (
        <Alert
          key={area}
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message={`${loadAreaLabels[area as PortfolioLoadArea]}：${error}`}
          action={<Button size="small" onClick={() => {
            if (area === 'groups') void loadGroups();
            if (area === 'summary') void loadSummary();
            if (area === 'holdings') void loadHoldings(activeGroupId ?? undefined);
            if (area === 'allocation') void loadAllocation();
          }}>{t('portfolio.retry')}</Button>}
        />
      ))}

      <PortfolioOverview summary={summary} allocation={allocation} holdings={holdings} navigate={navigate} />

      {prefillHolding && (
        <Alert
          showIcon
          type="info"
          style={{ marginBottom: 16 }}
          message={prefillHolding.shares
            ? t('portfolio.prefill.example', { name: prefillHolding.name, code: prefillHolding.code })
            : t('portfolio.prefill.pending', { name: prefillHolding.name, code: prefillHolding.code })}
          description={prefillHolding.shares
            ? t('portfolio.prefill.exampleDescription')
            : t('portfolio.prefill.pendingDescription')}
          action={(
            <Button onClick={openExample}>
              {groups.length > 0 ? t(prefillHolding.shares ? 'portfolio.prefill.fillExample' : 'portfolio.prefill.fillPending') : t('portfolio.prefill.createFirst')}
            </Button>
          )}
        />
      )}

      <Card
        size="small"
        style={{ marginBottom: 16, borderColor: 'var(--fq-evidence-model)' }}
        title={<Space wrap><span>{t('portfolio.paper.title')}</span><Tag color="purple">{t('portfolio.paper.simulated')}</Tag></Space>}
        extra={<Button onClick={() => setPaperCreateOpen(true)}>{t('portfolio.paper.create')}</Button>}
      >
        <Alert
          showIcon
          type="warning"
          style={{ marginBottom: 12 }}
          message={t('portfolio.paper.safety')}
          description={t('portfolio.paper.safetyDescription')}
        />
        {paperLoading ? (
          <div aria-label={t('portfolio.paper.loading')} style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
        ) : paperError ? (
          <Alert
            type="error"
            showIcon
            message={t('portfolio.paper.error', { error: paperError })}
            action={<Button size="small" onClick={() => void loadPaperPortfolios()}>{t('portfolio.paper.reload')}</Button>}
          />
        ) : paperItems.length === 0 ? (
          <Empty description={t('portfolio.paper.empty')} />
        ) : (
          <>
            <Space wrap style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
              <Select
                aria-label={t('portfolio.paper.select')}
                value={activePaperId ?? undefined}
                style={{ minWidth: 200, maxWidth: '100%' }}
                onChange={setActivePaperId}
                options={paperItems.map((item) => ({
                  value: item.id,
                  label: `${item.name} · ${item.base_currency}${item.status === 'ARCHIVED' ? ` · ${t('portfolio.paper.archivedSuffix')}` : ''}`,
                }))}
              />
              <Space wrap>
                <Button
                  type="primary"
                  disabled={paperItems.find((item) => item.id === activePaperId)?.status !== 'ACTIVE'}
                  onClick={openPaperLedger}
                >{t('portfolio.paper.recordTrade')}</Button>
                <Popconfirm title={t('portfolio.paper.archiveConfirm')} onConfirm={handleArchivePaper}>
                  <Button
                    danger
                    disabled={paperItems.find((item) => item.id === activePaperId)?.status !== 'ACTIVE'}
                    loading={paperActionLoading}
                  >{t('portfolio.paper.archive')}</Button>
                </Popconfirm>
              </Space>
            </Space>
            {paperValuationLoading ? (
              <div aria-label={t('portfolio.paper.valuationLoading')} style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
            ) : paperValuationError ? (
              <Alert
                type="error"
                showIcon
                message={t('portfolio.paper.valuationError', { error: paperValuationError })}
                action={<Button size="small" onClick={() => activePaperId != null && void loadPaperValuation(activePaperId)}>{t('portfolio.paper.valuationRetry')}</Button>}
              />
            ) : paperValuation ? (
              <>
                {paperValuation.valuation_status !== 'OK' && (
                  <Alert
                    showIcon
                    type={paperValuation.valuation_status === 'UPSTREAM_ERROR' ? 'error' : 'warning'}
                    style={{ marginBottom: 12 }}
                    message={t('portfolio.paper.valuationStatus', { status: paperValuation.valuation_status })}
                    description={paperValuation.valuation_reasons.join(' · ') || t('portfolio.paper.missingNotFilled')}
                  />
                )}
                <Row gutter={[12, 12]}>
                  <Col xs={12} md={6}><Statistic title={t('portfolio.paper.cash', { currency: paperValuation.base_currency })} value={paperValuation.cash} precision={2} /></Col>
                  <Col xs={12} md={6}><Statistic title={t('portfolio.paper.totalValue')} value={paperValuation.total_value ?? '--'} precision={2} /></Col>
                  <Col xs={12} md={6}><Statistic title={t('portfolio.paper.totalReturn')} value={paperValuation.total_return ?? '--'} suffix={paperValuation.total_return == null ? undefined : '%'} precision={2} /></Col>
                  <Col xs={12} md={6}><Statistic title={t('portfolio.paper.valuationQuality')} value={paperValuation.valuation_status} /></Col>
                </Row>
                {paperValuation.valuation_positions.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('portfolio.paper.noPositions')} />
                ) : paperValuation.valuation_positions.map((position) => (
                  <div key={position.symbol} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--fq-border)' }}>
                    <Space wrap>
                      <Text code>{position.symbol}</Text>
                      <Text>{t('portfolio.paper.quantity', { value: position.quantity })}</Text>
                      <Tag>{position.data_status}</Tag>
                      <Text>{t('portfolio.paper.currentPrice', { price: position.current_price ?? 'UNKNOWN', currency: position.quote_currency ?? '' })}</Text>
                      <Text type="secondary">{t('portfolio.paper.sourceAsOf', { source: position.source ?? 'UNKNOWN', asOf: position.as_of ?? 'UNKNOWN' })}</Text>
                    </Space>
                  </div>
                ))}
              </>
            ) : null}
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--fq-border)' }}>
              <Space wrap style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
                <Space wrap>
                  <Text strong>{t('portfolio.paper.reviewTitle')}</Text>
                  <Tag color="gold">USER_HYPOTHESIS</Tag>
                  <Tag>{t('portfolio.paper.nonCausal')}</Tag>
                </Space>
                <Button
                  size="small"
                  onClick={() => activePaperId != null && void loadPaperReviewContext(activePaperId)}
                >{t('portfolio.paper.reviewRefresh')}</Button>
              </Space>
              <Alert
                showIcon
                type="warning"
                style={{ marginBottom: 12 }}
                message={t('portfolio.paper.reviewChoice')}
                description={t('portfolio.paper.reviewChoiceDescription')}
              />
              {paperReviewContextLoading ? (
                <div aria-label={t('portfolio.paper.reviewLoading')} style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
              ) : paperReviewContextError ? (
                <Alert
                  type="error"
                  showIcon
                  message={t('portfolio.paper.reviewError', { error: paperReviewContextError })}
                  action={<Button size="small" onClick={() => activePaperId != null && void loadPaperReviewContext(activePaperId)}>{t('portfolio.paper.reviewReload')}</Button>}
                />
              ) : !paperReviewContext || paperReviewContext.hypotheses.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('portfolio.paper.noHypotheses')} />
              ) : (
                <>
                  <Space wrap style={{ marginBottom: 12 }}>
                    <Select
                      aria-label={t('portfolio.paper.selectHypothesis')}
                      value={selectedHypothesisId ?? undefined}
                      style={{ minWidth: 260, maxWidth: '100%' }}
                      onChange={(value) => {
                        setSelectedHypothesisId(value);
                        setPaperReviewDraft(null);
                        setPaperReviewDraftError(null);
                      }}
                      options={paperReviewContext.hypotheses.map((item) => ({
                        value: item.id,
                        label: `#${item.id} · ${item.subject_type}:${item.subject_id}`,
                      }))}
                    />
                    <Button
                      type="primary"
                      loading={paperReviewDraftLoading}
                      disabled={activePaperId == null || selectedHypothesisId == null}
                      onClick={() => activePaperId != null && selectedHypothesisId != null
                        && void loadPaperReviewDraft(activePaperId, selectedHypothesisId)}
                    >{t('portfolio.paper.prepareReview')}</Button>
                  </Space>
                  {selectedHypothesisId != null && (
                    <div style={{ marginBottom: 12 }}>
                      <Text type="secondary">{t('portfolio.paper.hypothesisContent')}</Text>{' '}
                      <Text>{JSON.stringify(paperReviewContext.hypotheses.find((item) => item.id === selectedHypothesisId)?.content ?? {})}</Text>
                    </div>
                  )}
                  {paperReviewDraftError && (
                    <Alert type="error" showIcon message={t('portfolio.paper.draftError', { error: paperReviewDraftError })} style={{ marginBottom: 12 }} />
                  )}
                  {paperReviewDraft && (
                    <Card size="small" title={t('portfolio.paper.draftTitle')} style={{ marginBottom: 12 }}>
                      <Tag color="blue" style={{ marginBottom: 12 }}>{t('portfolio.paper.computed')}</Tag>
                      {paperReviewDraft.simulation_result.valuation_status !== 'OK' && (
                        <Alert
                          showIcon
                          type={paperReviewDraft.simulation_result.valuation_status === 'UPSTREAM_ERROR' ? 'error' : 'warning'}
                          message={t('portfolio.paper.draftQuality', { status: paperReviewDraft.simulation_result.valuation_status })}
                          description={t('portfolio.paper.inconclusiveOnly', { reasons: paperReviewDraft.simulation_result.valuation_reasons.join(' · ') || t('portfolio.paper.missingNotFilled') })}
                          style={{ marginBottom: 12 }}
                        />
                      )}
                      <Row gutter={[12, 12]}>
                        <Col xs={12} md={6}><Statistic title={t('portfolio.paper.initialCash')} value={paperReviewDraft.simulation_result.initial_cash} precision={2} /></Col>
                        <Col xs={12} md={6}><Statistic title={t('portfolio.paper.reviewTotalValue')} value={paperReviewDraft.simulation_result.total_value ?? 'UNKNOWN'} precision={2} /></Col>
                        <Col xs={12} md={6}><Statistic title={t('portfolio.paper.reviewTotalReturn')} value={paperReviewDraft.simulation_result.total_return ?? 'UNKNOWN'} suffix={paperReviewDraft.simulation_result.total_return == null ? undefined : '%'} precision={2} /></Col>
                        <Col xs={12} md={6}><Statistic title={t('portfolio.paper.reviewQuality')} value={paperReviewDraft.simulation_result.valuation_status} /></Col>
                      </Row>
                      <div style={{ marginTop: 10 }}><Text type="secondary">{t('portfolio.paper.returnFormula')}</Text> <Text code>{paperReviewDraft.simulation_result.formula}</Text></div>
                      <div style={{ marginTop: 6 }}><Text type="secondary">{t('portfolio.paper.feeFormula')}</Text> <Text code>{paperReviewDraft.simulation_result.fee_formula}</Text></div>
                      {paperReviewDraft.simulation_result.positions.map((position) => (
                        <div key={position.symbol} style={{ marginTop: 8 }}>
                          <Text code>{position.symbol}</Text>{' '}
                          <Text>{t('portfolio.paper.currentPrice', { price: position.current_price ?? 'UNKNOWN', currency: '' })} · {t('portfolio.paper.sourceAsOf', { source: position.source ?? 'UNKNOWN', asOf: position.as_of ?? 'UNKNOWN' })}</Text>{' '}
                          <Tag>{position.data_status}</Tag>
                        </div>
                      ))}
                      <Alert showIcon type="warning" message={paperReviewDraft.warning} style={{ marginTop: 12 }} />
                      <Button type="primary" style={{ marginTop: 12 }} onClick={openPaperReview}>{t('portfolio.paper.recordReview')}</Button>
                    </Card>
                  )}
                  <Text strong>{t('portfolio.paper.reviewHistory')}</Text>
                  {paperReviewContext.reviews.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('portfolio.paper.noReviewHistory')} />
                  ) : paperReviewContext.reviews.map((review) => (
                    <div key={review.id} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--fq-border)' }}>
                      <Space wrap>
                        <Tag color={review.content.outcome === 'supported' ? 'green' : review.content.outcome === 'refuted' ? 'red' : 'default'}>
                          {paperOutcomeLabel[review.content.outcome]}
                        </Tag>
                        <Text>{review.content.reason}</Text>
                        <Text type="secondary">{t('portfolio.paper.observation', { from: review.content.observed_from, to: review.content.observed_to })}</Text>
                        <Tag>{review.content.simulation_result.valuation_status}</Tag>
                        <Text type="secondary">causal_proof=false</Text>
                      </Space>
                    </div>
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </Card>

      {/* Summary cards. */}
      <Row className="portfolio-summary-grid" gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {summaryCards.map((card) => (
          <Col xs={12} sm={6} key={card.title}>
            <Card className="portfolio-summary-card" size="small" hoverable>
              <FinancialMetric
                label={card.title}
                value={`${card.prefix || ''}${typeof card.value === 'number' ? card.value.toFixed(card.precision) : card.value}`}
                unit={card.suffix}
                period={t('portfolio.metric.period')}
                quality="OK"
                tone={card.key === 'pnl' || card.key === 'return' ? (Number(card.value) >= 0 ? 'up' : 'down') : 'neutral'}
              />
            </Card>
          </Col>
        ))}
        {!summary && [1, 2, 3, 4].map((i) => (
          <Col xs={12} sm={6} key={i}>
            <Card className="portfolio-summary-card" size="small"><Statistic title={t('portfolio.loading')} value={0} loading /></Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        {/* Holdings. */}
        <Col xs={24} lg={16}>
          <Card
            size="small"
            title={
              <Tabs
                size="small"
                activeKey={String(activeGroupId ?? '')}
                onChange={(key) => setActiveGroupId(Number(key))}
                items={groups.map((g) => ({ key: String(g.id), label: g.name }))}
                style={{ marginBottom: 0 }}
              />
            }
            extra={
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openAddModal}>
                {t('portfolio.addHolding')}
              </Button>
            }
          >
            <LoadStateView
              state={holdingsState}
              failureMessage={t('portfolio.holdingsLoadFailed')}
              onRetry={() => { void loadHoldings(activeGroupId ?? undefined); }}
              loadingText={t('portfolio.holdingsLoading')}
              announceLoading
              emptyContent={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('portfolio.noHoldings')} />}
            >
              <Table
                dataSource={holdings}
                columns={columns}
                rowKey="id"
                size="small"
                pagination={false}
                locale={{ emptyText: <Empty description={t('portfolio.noHoldings')} /> }}
                scroll={{ x: 700 }}
              />
            </LoadStateView>
          </Card>
        </Col>

        {/* Allocation. */}
        <Col xs={24} lg={8}>
          <Card size="small" title={t('portfolio.allocationTitle')}>
            {allocation.length > 0 ? (
              <div style={{ padding: '4px 0' }}>
                {allocation.map((alloc) => (
                  <div key={alloc.group_id} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text strong style={{ fontSize: 13 }}>{alloc.group_name}</Text>
                      <Text style={{ fontSize: 12, color: 'var(--fq-text-tertiary)' }}>{(alloc.weight * 100).toFixed(1)}%</Text>
                    </div>
                    <Progress percent={Math.round(alloc.weight * 100)} size="small" strokeColor="var(--fq-evidence-model)" showInfo={false} />
                    {alloc.items?.map((item) => (
                      <div key={item.code ?? item.name} style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 16, fontSize: 12, marginTop: 2 }}>
                        <span>{item.name}</span>
                        <span style={{ color: 'var(--fq-text-tertiary)' }}>{(item.weight * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <Empty description={t('portfolio.noAllocationData')} />
            )}
          </Card>
        </Col>
      </Row>

      <PortfolioRiskWorkbench
        holdings={holdings}
        initialCapital={holdings.reduce((total, holding) => total + holding.shares * holding.cost_price, 0)}
        portfolioName={activeGroupName}
      />

      {/* Add or edit holding. */}
      <Modal
        title={t(editingHolding ? 'portfolio.holding.editTitle' : 'portfolio.holding.addTitle')}
        open={modalOpen}
        onOk={handleModalOk}
        onCancel={() => setModalOpen(false)}
        confirmLoading={modalLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="group_id" label={t('portfolio.holding.group')} rules={[{ required: true, message: t('portfolio.holding.groupRequired') }]}>
            <Select options={groups.map((group) => ({ value: group.id, label: group.name }))} disabled={!!editingHolding} />
          </Form.Item>
          <Form.Item name="code" label={t('portfolio.holding.code')} rules={[{ required: true, message: t('portfolio.holding.codeRequired') }]}>
            <Input placeholder={t('portfolio.holding.codePlaceholder')} disabled={!!editingHolding} />
          </Form.Item>
          <Form.Item name="name" label={t('portfolio.holding.name')}>
            <Input placeholder={t('portfolio.holding.namePlaceholder')} disabled={!!editingHolding} />
          </Form.Item>
          <Form.Item name="shares" label={t('portfolio.holding.shares')} rules={[{ required: true, message: t('portfolio.holding.sharesRequired') }]}>
            <InputNumber style={{ width: '100%' }} min={0} precision={0} placeholder={t('portfolio.holding.sharesPlaceholder')} />
          </Form.Item>
          <Form.Item name="cost_price" label={t('portfolio.holding.cost')} rules={[{ required: true, message: t('portfolio.holding.costRequired') }]}>
            <InputNumber style={{ width: '100%' }} min={0} precision={2} addonBefore="¥" placeholder={t('portfolio.holding.costPlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={t('portfolio.createTitle')} open={portfolioModalOpen} onOk={handleCreatePortfolio}
        onCancel={() => setPortfolioModalOpen(false)} confirmLoading={portfolioLoading} destroyOnClose>
        <Form form={portfolioForm} layout="vertical" initialValues={{ currency: 'CNY' }}>
          <Form.Item name="name" label={t('portfolio.createName')} rules={[{ required: true, message: t('portfolio.createNameRequired') }]}>
            <Input placeholder={t('portfolio.createNamePlaceholder')} autoFocus />
          </Form.Item>
          <Form.Item name="description" label={t('portfolio.createDescription')}><Input.TextArea rows={2} placeholder={t('portfolio.optional')} /></Form.Item>
          <Form.Item name="currency" label={t('portfolio.currency')}>
            <Select options={[{ value: 'CNY', label: t('portfolio.currency.cny') }, { value: 'HKD', label: t('portfolio.currency.hkd') }, { value: 'USD', label: t('portfolio.currency.usd') }]} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('portfolio.paper.createTitle')}
        open={paperCreateOpen}
        onOk={handleCreatePaper}
        onCancel={() => setPaperCreateOpen(false)}
        confirmLoading={paperActionLoading}
        destroyOnClose
      >
        <Alert type="warning" showIcon message={t('portfolio.paper.createNotice')} style={{ marginBottom: 16 }} />
        <Form form={paperCreateForm} layout="vertical" initialValues={{ base_currency: 'CNY' }}>
          <Form.Item name="name" label={t('portfolio.paper.name')} rules={[{ required: true, message: t('portfolio.paper.nameRequired') }]}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="base_currency" label={t('portfolio.paper.baseCurrency')} rules={[{ required: true }]}>
            <Select options={['CNY', 'HKD', 'USD'].map((value) => ({ value, label: value }))} />
          </Form.Item>
          <Form.Item name="initial_cash" label={t('portfolio.paper.initialCash')} rules={[{ required: true, message: t('portfolio.paper.initialCashRequired') }]}>
            <InputNumber min={0.01} precision={2} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('portfolio.paper.ledgerTitle')}
        open={paperLedgerOpen}
        onOk={handleAppendPaperLedger}
        onCancel={() => setPaperLedgerOpen(false)}
        confirmLoading={paperActionLoading}
        destroyOnClose
      >
        <Alert type="info" showIcon message={t('portfolio.paper.ledgerNotice')} style={{ marginBottom: 16 }} />
        <Form form={paperLedgerForm} layout="vertical">
          <Row gutter={12}>
            <Col xs={24} sm={8}><Form.Item name="side" label={t('portfolio.paper.side')} rules={[{ required: true }]}><Select options={[{ value: 'BUY', label: t('portfolio.paper.buy') }, { value: 'SELL', label: t('portfolio.paper.sell') }]} /></Form.Item></Col>
            <Col xs={24} sm={16}><Form.Item name="symbol" label={t('portfolio.paper.symbol')} rules={[{ required: true, message: t('portfolio.paper.symbolRequired') }]}><Input placeholder={t('portfolio.paper.symbolPlaceholder')} /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col xs={12}><Form.Item name="quantity" label={t('portfolio.paper.tradeQuantity')} rules={[{ required: true }]}><InputNumber min={0.00000001} style={{ width: '100%' }} /></Form.Item></Col>
            <Col xs={12}><Form.Item name="simulation_price" label={t('portfolio.paper.tradePrice')} rules={[{ required: true }]}><InputNumber min={0.00000001} style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col xs={12}><Form.Item name="fee" label={t('portfolio.paper.fee')} rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col xs={12}><Form.Item name="currency" label={t('portfolio.paper.currency')} rules={[{ required: true }]}><Select options={['CNY', 'HKD', 'USD'].map((value) => ({ value, label: value }))} /></Form.Item></Col>
          </Row>
          <Form.Item name="simulation_as_of" label={t('portfolio.paper.asOf')} rules={[{ required: true, message: t('portfolio.paper.asOfRequired') }]}><Input /></Form.Item>
          <Form.Item name="simulation_source" label={t('portfolio.paper.priceSource')} rules={[{ required: true, message: t('portfolio.paper.priceSourceRequired') }]}><Input placeholder={t('portfolio.paper.priceSourcePlaceholder')} /></Form.Item>
          <Form.Item name="idempotency_key" label={t('portfolio.paper.idempotency')} rules={[{ required: true, message: t('portfolio.paper.idempotencyRequired') }]}><Input /></Form.Item>
          <Alert type="warning" showIcon message={t('portfolio.paper.fxNotice')} style={{ marginBottom: 12 }} />
          <Row gutter={12}>
            <Col xs={24} sm={8}><Form.Item name="fx_rate_to_base" label={t('portfolio.paper.fxRate')}><InputNumber min={0.00000001} style={{ width: '100%' }} /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="fx_source" label={t('portfolio.paper.fxSource')}><Input /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="fx_as_of" label={t('portfolio.paper.fxAsOf')}><Input /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title={t('portfolio.paper.reviewModalTitle')}
        open={paperReviewOpen}
        onOk={handleSavePaperReview}
        onCancel={() => setPaperReviewOpen(false)}
        confirmLoading={paperActionLoading}
        destroyOnClose
      >
        <Alert
          showIcon
          type="warning"
          message={t('portfolio.paper.reviewNotice')}
          description={t('portfolio.paper.reviewNoticeDescription')}
          style={{ marginBottom: 16 }}
        />
        <Form form={paperReviewForm} layout="vertical">
          <Form.Item name="hypothesis_memory_id" hidden><InputNumber /></Form.Item>
          <Form.Item name="outcome" label={t('portfolio.paper.outcome')} rules={[{ required: true, message: t('portfolio.paper.outcomeRequired') }]}>
            <Select
              placeholder={t('portfolio.paper.outcomePlaceholder')}
              options={(paperReviewDraft?.outcome_options ?? []).map((value) => ({ value, label: paperOutcomeLabel[value] }))}
            />
          </Form.Item>
          <Form.Item name="reason" label={t('portfolio.paper.reason')} rules={[{ required: true, message: t('portfolio.paper.reasonRequired') }]}>
            <Input.TextArea maxLength={1000} rows={3} />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="observed_from" label={t('portfolio.paper.observedFrom')} rules={[{ required: true, message: t('portfolio.paper.observedFromRequired') }]}><Input placeholder="2026-08-01T00:00:00Z" /></Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="observed_to" label={t('portfolio.paper.observedTo')} rules={[{ required: true, message: t('portfolio.paper.observedToRequired') }]}><Input placeholder="2026-08-13T00:00:00Z" /></Form.Item>
            </Col>
          </Row>
          <Form.Item name="idempotency_key" label={t('portfolio.paper.idempotency')} rules={[{ required: true, message: t('portfolio.paper.idempotencyRequired') }]}>
            <Input maxLength={100} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Disclaimer. */}
      <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--fq-text-tertiary)', marginTop: 24 }}>
        {t('today.disclaimer')}
      </div>
    </div>
  );
}
