/* ============================================================
 * Portfolio — 投资组合页（/portfolio）
 * 功能：分组标签 + 汇总卡片 + 持仓表格 + 配置分布 + 增/改弹窗
 * ============================================================ */
import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
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

const { Text } = Typography;

type PortfolioLoadArea = 'groups' | 'summary' | 'holdings' | 'allocation';

const loadAreaLabels: Record<PortfolioLoadArea, string> = {
  groups: '组合列表',
  summary: '组合汇总',
  holdings: '持仓明细',
  allocation: '资产配置',
};

const loadErrorText = (error: unknown) => error instanceof Error ? error.message : '请求失败';
const paperOutcomeLabel = {
  supported: 'supported · 支持',
  refuted: 'refuted · 反驳',
  inconclusive: 'inconclusive · 无法判断',
};

// ==================== 颜色辅助 ====================
const profitColor = (v?: number) => (v != null ? (v >= 0 ? '#f23645' : '#089981') : '#666');
const profitPrefix = (v?: number) => (v != null ? (v >= 0 ? '+' : '') : '');

// ==================== 页面组件 ====================
export default function Portfolio() {
  const [searchParams] = useSearchParams();
  const requestedCode = searchParams.get('code')?.trim().toUpperCase();
  const prefillHolding = requestedCode
    ? { code: requestedCode, name: searchParams.get('name')?.trim() || requestedCode, shares: undefined }
    : searchParams.get('example') === '600519'
      ? { code: '600519', name: '贵州茅台', shares: 10 }
      : null;

  // 数据
  const [groups, setGroups] = useState<PortfolioGroup[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [allocation, setAllocation] = useState<PortfolioAllocation[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);

  // 状态
  const [loading, setLoading] = useState(true);
  const [holdingLoading, setHoldingLoading] = useState(false);
  const [loadErrors, setLoadErrors] = useState<Partial<Record<PortfolioLoadArea, string>>>({});

  // 弹窗
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState<PortfolioHolding | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [form] = Form.useForm();
  const [portfolioModalOpen, setPortfolioModalOpen] = useState(false);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioForm] = Form.useForm();

  // 与现有组合完全分离的模拟组合状态
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

  // ---------- 加载分组 ----------
  const loadGroups = useCallback(async () => {
    setLoadError('groups');
    try {
      const g = await fetchPortfolioGroups();
      setGroups(g);
      if (g.length > 0 && activeGroupId == null) {
        setActiveGroupId(g[0].id);
      }
    } catch (error) {
      setLoadError('groups', error);
    }
  }, [activeGroupId, setLoadError]);

  // ---------- 加载汇总 ----------
  const loadSummary = useCallback(async () => {
    setLoadError('summary');
    try {
      const s = await fetchPortfolioSummary();
      setSummary(s);
    } catch (error) {
      setLoadError('summary', error);
    }
  }, [setLoadError]);

  // ---------- 加载持仓 ----------
  const loadHoldings = useCallback(async (groupId?: number) => {
    setHoldingLoading(true);
    setLoadError('holdings');
    try {
      const h = await fetchPortfolioHoldings(groupId);
      setHoldings(h);
    } catch (error) {
      setLoadError('holdings', error);
    }
    finally { setHoldingLoading(false); }
  }, [setLoadError]);

  // ---------- 加载配置 ----------
  const loadAllocation = useCallback(async () => {
    setLoadError('allocation');
    try {
      const a = await fetchPortfolioAllocation();
      setAllocation(a);
    } catch (error) {
      setLoadError('allocation', error);
    }
  }, [setLoadError]);

  // ---------- 首次加载 ----------
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

  // ---------- 切换分组 ----------
  useEffect(() => {
    if (activeGroupId != null) loadHoldings(activeGroupId);
  }, [activeGroupId, loadHoldings]);

  // ---------- 新建/编辑持仓 ----------
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
    portfolioForm.setFieldsValue({ name: '首次体检', currency: 'CNY' });
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
      message.success('投资组合已创建');
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
        message.success('持仓已更新');
      } else {
        await addPortfolioHolding(values);
        message.success('持仓已添加');
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

  // ---------- 删除持仓 ----------
  const handleDelete = async (id: number) => {
    try {
      await deletePortfolioHolding(id);
      message.success('已删除');
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
      message.success('模拟组合已创建');
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
        message.error(`非基础币种必须填写 ${values.currency} 到 ${baseCurrency} 的换算率、来源和时点`);
        return;
      }
      setPaperActionLoading(true);
      await apiClient.post(`/portfolio/paper/${activePaperId}/ledger`, values);
      setPaperLedgerOpen(false);
      paperLedgerForm.resetFields();
      await Promise.all([loadPaperPortfolios(), loadPaperValuation(activePaperId)]);
      message.success('模拟记录已追加');
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
      message.success('模拟组合已停用，历史账本保留');
    } catch (error: any) {
      message.error(error?.message || '停用失败');
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
      message.success('模拟复盘判断已记录');
    } catch (error: any) {
      if (error?.message) message.error(error.message);
    } finally {
      setPaperActionLoading(false);
    }
  };

  // ---------- 汇总卡片 ----------
  const summaryCards = summary ? [
    { title: '总投入', value: summary.total_invested, prefix: '¥', precision: 2, color: 'var(--fq-ai-primary)' },
    { title: '当前市值', value: summary.total_current, prefix: '¥', precision: 2, color: '#722ed1' },
    { title: '总盈亏', value: summary.total_profit, prefix: '¥', precision: 2, color: profitColor(summary.total_profit) },
    { title: '收益率', value: summary.total_profit_percent, suffix: '%', precision: 2, color: profitColor(summary.total_profit_percent) },
  ] : [];

  // ---------- 持仓表格列 ----------
  const columns = [
    { title: '代码', dataIndex: 'code', key: 'code', width: 90, render: (v: string) => <Text code>{v}</Text> },
    { title: '名称', dataIndex: 'name', key: 'name', width: 100 },
    { title: '持仓数量', dataIndex: 'shares', key: 'shares', width: 100, align: 'right' as const, render: (v: number) => v.toLocaleString() },
    { title: '成本价', dataIndex: 'cost_price', key: 'cost_price', width: 100, align: 'right' as const, render: (v: number) => `¥${v.toFixed(2)}` },
    { title: '现价', dataIndex: 'current_price', key: 'current_price', width: 100, align: 'right' as const, render: (v?: number) => v != null ? `¥${v.toFixed(2)}` : '--' },
    {
      title: '盈亏', dataIndex: 'profit', key: 'profit', width: 120, align: 'right' as const,
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
      title: '操作', key: 'action', width: 100,
      render: (_: any, record: PortfolioHolding) => (
        <span>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>编辑</Button>
          <Popconfirm title="确认删除此持仓？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </span>
      ),
    },
  ];

  const activeGroupName = groups.find((group) => group.id === activeGroupId)?.name;
  const portfolioHeader = (
    <TaskPageHeader
      eyebrow="PORTFOLIO"
      title="投资组合"
      goal="查看真实盈亏与当前配置，并继续维护持仓。"
      object={activeGroupName || (groups.length ? '全部组合' : '尚未创建组合')}
      status={loading ? '正在加载组合数据' : summary ? '行情与盈亏已更新' : groups.length ? '等待组合行情' : '暂无组合'}
      statusTone={loading ? 'loading' : summary ? 'success' : 'neutral'}
      actions={!loading ? (
        <>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setPortfolioModalOpen(true)}>新建组合</Button>
          <Button icon={<ReloadOutlined />} onClick={() => { loadSummary(); loadHoldings(activeGroupId ?? undefined); loadAllocation(); }}>
            刷新
          </Button>
        </>
      ) : undefined}
    />
  );

  // ==================== 渲染 ====================
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

      {Object.entries(loadErrors).map(([area, error]) => (
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
          }}>重试</Button>}
        />
      ))}

      {prefillHolding && (
        <Alert
          showIcon
          type="info"
          style={{ marginBottom: 16 }}
          message={prefillHolding.shares
            ? `真实示例：${prefillHolding.name} ${prefillHolding.code}`
            : `待加入组合：${prefillHolding.name} ${prefillHolding.code}`}
          description={prefillHolding.shares
            ? '真实示例只预填股票、名称和 10 股数量；成本价保留为空。点击确认前不会写入任何持仓。'
            : '入口只预填股票代码和名称；持仓数量与成本价保留为空。点击确认前不会写入任何持仓。'}
          action={(
            <Button onClick={openExample}>
              {groups.length > 0 ? (prefillHolding.shares ? '填入示例持仓' : '填入待添加持仓') : '先创建组合'}
            </Button>
          )}
        />
      )}

      <Card
        size="small"
        style={{ marginBottom: 16, borderColor: '#d3adf7' }}
        title={<Space wrap><span>模拟组合</span><Tag color="purple">PAPER · SIMULATED</Tag></Space>}
        extra={<Button onClick={() => setPaperCreateOpen(true)}>新建模拟组合</Button>}
      >
        <Alert
          showIcon
          type="warning"
          style={{ marginBottom: 12 }}
          message="仅用于研究模拟，与现有组合完全分离"
          description="现金、成交价、费用和历史均为显式模拟输入；不会连接真实账户、发送真实指令或自动执行。"
        />
        {paperLoading ? (
          <div aria-label="正在加载模拟组合" style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
        ) : paperError ? (
          <Alert
            type="error"
            showIcon
            message={`模拟组合：${paperError}`}
            action={<Button size="small" onClick={() => void loadPaperPortfolios()}>重新加载模拟组合</Button>}
          />
        ) : paperItems.length === 0 ? (
          <Empty description="暂无模拟组合；创建后才会写入独立模拟账本" />
        ) : (
          <>
            <Space wrap style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
              <Select
                aria-label="选择模拟组合"
                value={activePaperId ?? undefined}
                style={{ minWidth: 200, maxWidth: '100%' }}
                onChange={setActivePaperId}
                options={paperItems.map((item) => ({
                  value: item.id,
                  label: `${item.name} · ${item.base_currency}${item.status === 'ARCHIVED' ? ' · 已停用' : ''}`,
                }))}
              />
              <Space wrap>
                <Button
                  type="primary"
                  disabled={paperItems.find((item) => item.id === activePaperId)?.status !== 'ACTIVE'}
                  onClick={openPaperLedger}
                >记录模拟买卖</Button>
                <Popconfirm title="停用后不可再追加，历史账本会保留。确认停用？" onConfirm={handleArchivePaper}>
                  <Button
                    danger
                    disabled={paperItems.find((item) => item.id === activePaperId)?.status !== 'ACTIVE'}
                    loading={paperActionLoading}
                  >停用</Button>
                </Popconfirm>
              </Space>
            </Space>
            {paperValuationLoading ? (
              <div aria-label="正在计算模拟估值" style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
            ) : paperValuationError ? (
              <Alert
                type="error"
                showIcon
                message={`模拟估值：${paperValuationError}`}
                action={<Button size="small" onClick={() => activePaperId != null && void loadPaperValuation(activePaperId)}>重试估值</Button>}
              />
            ) : paperValuation ? (
              <>
                {paperValuation.valuation_status !== 'OK' && (
                  <Alert
                    showIcon
                    type={paperValuation.valuation_status === 'UPSTREAM_ERROR' ? 'error' : 'warning'}
                    style={{ marginBottom: 12 }}
                    message={`模拟估值状态：${paperValuation.valuation_status}`}
                    description={paperValuation.valuation_reasons.join('；') || '缺失值未代填'}
                  />
                )}
                <Row gutter={[12, 12]}>
                  <Col xs={12} md={6}><Statistic title={`模拟现金 (${paperValuation.base_currency})`} value={paperValuation.cash} precision={2} /></Col>
                  <Col xs={12} md={6}><Statistic title="模拟总值" value={paperValuation.total_value ?? '--'} precision={2} /></Col>
                  <Col xs={12} md={6}><Statistic title="模拟收益率" value={paperValuation.total_return ?? '--'} suffix={paperValuation.total_return == null ? undefined : '%'} precision={2} /></Col>
                  <Col xs={12} md={6}><Statistic title="估值质量" value={paperValuation.valuation_status} /></Col>
                </Row>
                {paperValuation.valuation_positions.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="模拟账本尚无持仓" />
                ) : paperValuation.valuation_positions.map((position) => (
                  <div key={position.symbol} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0f0f0' }}>
                    <Space wrap>
                      <Text code>{position.symbol}</Text>
                      <Text>{position.quantity} 股</Text>
                      <Tag>{position.data_status}</Tag>
                      <Text>现价 {position.current_price ?? 'UNKNOWN'} {position.quote_currency ?? ''}</Text>
                      <Text type="secondary">来源 {position.source ?? 'UNKNOWN'} · 时点 {position.as_of ?? 'UNKNOWN'}</Text>
                    </Space>
                  </div>
                ))}
              </>
            ) : null}
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
              <Space wrap style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
                <Space wrap>
                  <Text strong>Hypothesis 模拟复盘</Text>
                  <Tag color="gold">USER_HYPOTHESIS</Tag>
                  <Tag>非因果证明</Tag>
                </Space>
                <Button
                  size="small"
                  onClick={() => activePaperId != null && void loadPaperReviewContext(activePaperId)}
                >刷新复盘</Button>
              </Space>
              <Alert
                showIcon
                type="warning"
                style={{ marginBottom: 12 }}
                message="复盘判断必须由用户显式选择"
                description="系统只展示模拟计算与数据质量，不推荐 supported/refuted/inconclusive，也不会修改原 hypothesis 或把结果视为事实。"
              />
              {paperReviewContextLoading ? (
                <div aria-label="正在加载模拟复盘" style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
              ) : paperReviewContextError ? (
                <Alert
                  type="error"
                  showIcon
                  message={`模拟复盘：${paperReviewContextError}`}
                  action={<Button size="small" onClick={() => activePaperId != null && void loadPaperReviewContext(activePaperId)}>重新加载复盘</Button>}
                />
              ) : !paperReviewContext || paperReviewContext.hypotheses.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 hypothesis 记忆；请先在研究记忆中显式保存假设" />
              ) : (
                <>
                  <Space wrap style={{ marginBottom: 12 }}>
                    <Select
                      aria-label="选择待复盘 hypothesis"
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
                    >准备模拟复盘</Button>
                  </Space>
                  {selectedHypothesisId != null && (
                    <div style={{ marginBottom: 12 }}>
                      <Text type="secondary">假设内容：</Text>{' '}
                      <Text>{JSON.stringify(paperReviewContext.hypotheses.find((item) => item.id === selectedHypothesisId)?.content ?? {})}</Text>
                    </div>
                  )}
                  {paperReviewDraftError && (
                    <Alert type="error" showIcon message={`复盘草稿：${paperReviewDraftError}`} style={{ marginBottom: 12 }} />
                  )}
                  {paperReviewDraft && (
                    <Card size="small" title="只读模拟复盘草稿" style={{ marginBottom: 12 }}>
                      <Tag color="blue" style={{ marginBottom: 12 }}>COMPUTED_RESULT · 模拟计算</Tag>
                      {paperReviewDraft.simulation_result.valuation_status !== 'OK' && (
                        <Alert
                          showIcon
                          type={paperReviewDraft.simulation_result.valuation_status === 'UPSTREAM_ERROR' ? 'error' : 'warning'}
                          message={`草稿质量：${paperReviewDraft.simulation_result.valuation_status}`}
                          description={`${paperReviewDraft.simulation_result.valuation_reasons.join('；') || '缺失值未代填'}；当前仅允许 inconclusive`}
                          style={{ marginBottom: 12 }}
                        />
                      )}
                      <Row gutter={[12, 12]}>
                        <Col xs={12} md={6}><Statistic title="初始模拟现金" value={paperReviewDraft.simulation_result.initial_cash} precision={2} /></Col>
                        <Col xs={12} md={6}><Statistic title="复盘模拟总值" value={paperReviewDraft.simulation_result.total_value ?? 'UNKNOWN'} precision={2} /></Col>
                        <Col xs={12} md={6}><Statistic title="复盘模拟收益率" value={paperReviewDraft.simulation_result.total_return ?? 'UNKNOWN'} suffix={paperReviewDraft.simulation_result.total_return == null ? undefined : '%'} precision={2} /></Col>
                        <Col xs={12} md={6}><Statistic title="复盘数据质量" value={paperReviewDraft.simulation_result.valuation_status} /></Col>
                      </Row>
                      <div style={{ marginTop: 10 }}><Text type="secondary">收益公式：</Text> <Text code>{paperReviewDraft.simulation_result.formula}</Text></div>
                      <div style={{ marginTop: 6 }}><Text type="secondary">费用公式：</Text> <Text code>{paperReviewDraft.simulation_result.fee_formula}</Text></div>
                      {paperReviewDraft.simulation_result.positions.map((position) => (
                        <div key={position.symbol} style={{ marginTop: 8 }}>
                          <Text code>{position.symbol}</Text>{' '}
                          <Text>现价 {position.current_price ?? 'UNKNOWN'} · 来源 {position.source ?? 'UNKNOWN'} · 时点 {position.as_of ?? 'UNKNOWN'}</Text>{' '}
                          <Tag>{position.data_status}</Tag>
                        </div>
                      ))}
                      <Alert showIcon type="warning" message={paperReviewDraft.warning} style={{ marginTop: 12 }} />
                      <Button type="primary" style={{ marginTop: 12 }} onClick={openPaperReview}>记录复盘判断</Button>
                    </Card>
                  )}
                  <Text strong>复盘历史</Text>
                  {paperReviewContext.reviews.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无模拟复盘历史" />
                  ) : paperReviewContext.reviews.map((review) => (
                    <div key={review.id} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0f0f0' }}>
                      <Space wrap>
                        <Tag color={review.content.outcome === 'supported' ? 'green' : review.content.outcome === 'refuted' ? 'red' : 'default'}>
                          {paperOutcomeLabel[review.content.outcome]}
                        </Tag>
                        <Text>{review.content.reason}</Text>
                        <Text type="secondary">观察 {review.content.observed_from} → {review.content.observed_to}</Text>
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

      {/* 汇总卡片 */}
      <Row className="portfolio-summary-grid" gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {summaryCards.map((card) => (
          <Col xs={12} sm={6} key={card.title}>
            <Card className="portfolio-summary-card" size="small" hoverable>
              <FinancialMetric
                label={card.title}
                value={`${card.prefix || ''}${typeof card.value === 'number' ? card.value.toFixed(card.precision) : card.value}`}
                unit={card.suffix}
                period="当前组合"
                quality="OK"
                tone={card.title === '总盈亏' || card.title === '收益率' ? (Number(card.value) >= 0 ? 'up' : 'down') : 'neutral'}
              />
            </Card>
          </Col>
        ))}
        {!summary && [1, 2, 3, 4].map((i) => (
          <Col xs={12} sm={6} key={i}>
            <Card className="portfolio-summary-card" size="small"><Statistic title="加载中..." value={0} loading /></Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        {/* 持仓列表 */}
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
                添加持仓
              </Button>
            }
          >
            <Table
              dataSource={holdings}
              columns={columns}
              rowKey="id"
              size="small"
              loading={holdingLoading}
              pagination={false}
              locale={{ emptyText: <Empty description="暂无持仓" /> }}
              scroll={{ x: 700 }}
            />
          </Card>
        </Col>

        {/* 配置分布 */}
        <Col xs={24} lg={8}>
          <Card size="small" title="资产配置分布">
            {allocation.length > 0 ? (
              <div style={{ padding: '4px 0' }}>
                {allocation.map((alloc) => (
                  <div key={alloc.group_id} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text strong style={{ fontSize: 13 }}>{alloc.group_name}</Text>
                      <Text style={{ fontSize: 12, color: '#888' }}>{(alloc.weight * 100).toFixed(1)}%</Text>
                    </div>
                    <Progress percent={Math.round(alloc.weight * 100)} size="small" strokeColor="#722ed1" showInfo={false} />
                    {alloc.items?.map((item) => (
                      <div key={item.code ?? item.name} style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 16, fontSize: 12, marginTop: 2 }}>
                        <span>{item.name}</span>
                        <span style={{ color: '#888' }}>{(item.weight * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <Empty description="暂无配置数据" />
            )}
          </Card>
        </Col>
      </Row>

      <PortfolioRiskWorkbench
        holdings={holdings}
        initialCapital={holdings.reduce((total, holding) => total + holding.shares * holding.cost_price, 0)}
        portfolioName={activeGroupName}
      />

      {/* 添加/编辑弹窗 */}
      <Modal
        title={editingHolding ? '编辑持仓' : '添加持仓'}
        open={modalOpen}
        onOk={handleModalOk}
        onCancel={() => setModalOpen(false)}
        confirmLoading={modalLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="group_id" label="所属组合" rules={[{ required: true, message: '请选择组合' }]}>
            <Select options={groups.map((group) => ({ value: group.id, label: group.name }))} disabled={!!editingHolding} />
          </Form.Item>
          <Form.Item name="code" label="股票代码" rules={[{ required: true, message: '请输入股票代码' }]}>
            <Input placeholder="如 600519" disabled={!!editingHolding} />
          </Form.Item>
          <Form.Item name="name" label="股票名称（可选）">
            <Input placeholder="留空时自动使用行情名称" disabled={!!editingHolding} />
          </Form.Item>
          <Form.Item name="shares" label="持仓数量" rules={[{ required: true, message: '请输入持仓数量' }]}>
            <InputNumber style={{ width: '100%' }} min={0} precision={0} placeholder="股数" />
          </Form.Item>
          <Form.Item name="cost_price" label="持仓成本价" rules={[{ required: true, message: '请输入成本价' }]}>
            <InputNumber style={{ width: '100%' }} min={0} precision={2} addonBefore="¥" placeholder="每股成本" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="新建投资组合" open={portfolioModalOpen} onOk={handleCreatePortfolio}
        onCancel={() => setPortfolioModalOpen(false)} confirmLoading={portfolioLoading} destroyOnClose>
        <Form form={portfolioForm} layout="vertical" initialValues={{ currency: 'CNY' }}>
          <Form.Item name="name" label="组合名称" rules={[{ required: true, message: '请输入组合名称' }]}>
            <Input placeholder="如 长期配置" autoFocus />
          </Form.Item>
          <Form.Item name="description" label="说明"><Input.TextArea rows={2} placeholder="可选" /></Form.Item>
          <Form.Item name="currency" label="计价货币">
            <Select options={[{ value: 'CNY', label: 'CNY 人民币' }, { value: 'HKD', label: 'HKD 港元' }, { value: 'USD', label: 'USD 美元' }]} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="新建模拟组合"
        open={paperCreateOpen}
        onOk={handleCreatePaper}
        onCancel={() => setPaperCreateOpen(false)}
        confirmLoading={paperActionLoading}
        destroyOnClose
      >
        <Alert type="warning" showIcon message="这是独立模拟账本，不会影响现有组合。" style={{ marginBottom: 16 }} />
        <Form form={paperCreateForm} layout="vertical" initialValues={{ base_currency: 'CNY' }}>
          <Form.Item name="name" label="模拟组合名称" rules={[{ required: true, message: '请输入模拟组合名称' }]}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="base_currency" label="基础币种" rules={[{ required: true }]}>
            <Select options={['CNY', 'HKD', 'USD'].map((value) => ({ value, label: value }))} />
          </Form.Item>
          <Form.Item name="initial_cash" label="初始模拟现金" rules={[{ required: true, message: '请输入初始模拟现金' }]}>
            <InputNumber min={0.01} precision={2} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="追加模拟账本记录"
        open={paperLedgerOpen}
        onOk={handleAppendPaperLedger}
        onCancel={() => setPaperLedgerOpen(false)}
        confirmLoading={paperActionLoading}
        destroyOnClose
      >
        <Alert type="info" showIcon message="所有字段均为模拟输入；保存后只追加，不覆盖历史。" style={{ marginBottom: 16 }} />
        <Form form={paperLedgerForm} layout="vertical">
          <Row gutter={12}>
            <Col xs={24} sm={8}><Form.Item name="side" label="模拟方向" rules={[{ required: true }]}><Select options={[{ value: 'BUY', label: 'BUY 模拟买入' }, { value: 'SELL', label: 'SELL 模拟卖出' }]} /></Form.Item></Col>
            <Col xs={24} sm={16}><Form.Item name="symbol" label="标的" rules={[{ required: true, message: '请输入标的' }]}><Input placeholder="如 AAPL / 600519" /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col xs={12}><Form.Item name="quantity" label="模拟数量" rules={[{ required: true }]}><InputNumber min={0.00000001} style={{ width: '100%' }} /></Form.Item></Col>
            <Col xs={12}><Form.Item name="simulation_price" label="模拟成交价" rules={[{ required: true }]}><InputNumber min={0.00000001} style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col xs={12}><Form.Item name="fee" label="模拟费用" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col xs={12}><Form.Item name="currency" label="币种" rules={[{ required: true }]}><Select options={['CNY', 'HKD', 'USD'].map((value) => ({ value, label: value }))} /></Form.Item></Col>
          </Row>
          <Form.Item name="simulation_as_of" label="模拟时点" rules={[{ required: true, message: '请输入模拟时点' }]}><Input /></Form.Item>
          <Form.Item name="simulation_source" label="模拟价格来源" rules={[{ required: true, message: '请输入模拟价格来源' }]}><Input placeholder="例如：用户录入 / 研究快照标识" /></Form.Item>
          <Form.Item name="idempotency_key" label="请求标识（幂等）" rules={[{ required: true, message: '请输入唯一请求标识' }]}><Input /></Form.Item>
          <Alert type="warning" showIcon message="非基础币种还必须填写可验证的换算信息，否则不会保存。" style={{ marginBottom: 12 }} />
          <Row gutter={12}>
            <Col xs={24} sm={8}><Form.Item name="fx_rate_to_base" label="换算率"><InputNumber min={0.00000001} style={{ width: '100%' }} /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="fx_source" label="换算来源"><Input /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="fx_as_of" label="换算时点"><Input /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title="记录模拟复盘判断"
        open={paperReviewOpen}
        onOk={handleSavePaperReview}
        onCancel={() => setPaperReviewOpen(false)}
        confirmLoading={paperActionLoading}
        destroyOnClose
      >
        <Alert
          showIcon
          type="warning"
          message="这是用户判断，不是事实或因果证明"
          description="系统不会预选 outcome；估值不完整时只能选择 inconclusive。"
          style={{ marginBottom: 16 }}
        />
        <Form form={paperReviewForm} layout="vertical">
          <Form.Item name="hypothesis_memory_id" hidden><InputNumber /></Form.Item>
          <Form.Item name="outcome" label="复盘 outcome" rules={[{ required: true, message: '请显式选择复盘 outcome' }]}>
            <Select
              placeholder="请选择，不会自动推荐"
              options={(paperReviewDraft?.outcome_options ?? []).map((value) => ({ value, label: paperOutcomeLabel[value] }))}
            />
          </Form.Item>
          <Form.Item name="reason" label="判断理由" rules={[{ required: true, message: '请输入判断理由' }]}>
            <Input.TextArea maxLength={1000} rows={3} />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="observed_from" label="观察开始（ISO-8601）" rules={[{ required: true, message: '请输入观察开始时间' }]}><Input placeholder="2026-08-01T00:00:00Z" /></Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="observed_to" label="观察结束（ISO-8601）" rules={[{ required: true, message: '请输入观察结束时间' }]}><Input placeholder="2026-08-13T00:00:00Z" /></Form.Item>
            </Col>
          </Row>
          <Form.Item name="idempotency_key" label="请求标识（幂等）" rules={[{ required: true, message: '请输入唯一请求标识' }]}>
            <Input maxLength={100} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 免责声明 */}
      <div style={{ textAlign: 'center', fontSize: 11, color: '#bbb', marginTop: 24 }}>
        此内容由 AI 生成，不构成投资建议
      </div>
    </div>
  );
}
