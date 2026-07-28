import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Button, Card, Col, Descriptions, Empty, Input, List, Row, Skeleton,
  Space, Statistic, Tag, Typography, message,
} from 'antd';
import {
  ArrowRightOutlined, ExperimentOutlined, FileSearchOutlined, ReloadOutlined,
  SaveOutlined, SearchOutlined,
} from '@ant-design/icons';
import ResearchCharts from '../components/research/ResearchCharts';
import {
  fetchInstrumentBars,
  fetchInstrumentFundamentals,
  fetchInstrumentSnapshot,
  fetchResearchWorkspace,
  listResearchWorkspaces,
  saveResearchWorkspace,
  searchInstruments,
} from '../services/researchApi';
import type {
  BarsResponse, EvidenceItem, FundamentalItem, FundamentalsResponse, Instrument,
  ResearchWorkspace as WorkspaceType, SnapshotResponse,
} from '../types/research';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const metricLabels: Record<string, string> = {
  trailingMarketCap: '总市值',
  trailingPeRatio: '市盈率（TTM）',
  trailingPbRatio: '市净率',
  trailingEps: '每股收益（TTM）',
  trailingTotalRevenue: '营业收入（TTM）',
  trailingNetIncome: '净利润（TTM）',
  trailingOperatingCashFlow: '经营现金流（TTM）',
  trailingFreeCashFlow: '自由现金流（TTM）',
};

function formatNumber(value: number | null | undefined, currency?: string | null) {
  if (value == null) return '—';
  if (Math.abs(value) >= 1e12) return `${(value / 1e12).toFixed(2)}万亿${currency ? ` ${currency}` : ''}`;
  if (Math.abs(value) >= 1e8) return `${(value / 1e8).toFixed(2)}亿${currency ? ` ${currency}` : ''}`;
  if (Math.abs(value) >= 1e4) return `${(value / 1e4).toFixed(2)}万${currency ? ` ${currency}` : ''}`;
  return `${value.toLocaleString('zh-CN', { maximumFractionDigits: 4 })}${currency ? ` ${currency}` : ''}`;
}

function provenanceEvidence(snapshot?: SnapshotResponse | null, bars?: BarsResponse | null, fundamentals?: FundamentalsResponse | null): EvidenceItem[] {
  return [
    snapshot && {
      label: 'FACT' as const,
      title: '当前行情快照',
      detail: `${snapshot.instrument.name} ${snapshot.data.price} ${snapshot.currency ?? ''}`,
      provider: snapshot.provider,
      as_of: snapshot.as_of,
    },
    bars && {
      label: 'FACT' as const,
      title: '日线与技术指标',
      detail: `${bars.items.length} 条 ${bars.frequency} K线，复权口径 ${bars.adjustment}`,
      provider: bars.provider,
      as_of: bars.as_of,
    },
    fundamentals && {
      label: 'FACT' as const,
      title: '基本面时点指标',
      detail: `${fundamentals.items.length} 个带报告期的指标`,
      provider: fundamentals.provider,
      as_of: fundamentals.as_of,
    },
  ].filter(Boolean) as EvidenceItem[];
}

export default function ResearchWorkspace() {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const currentSymbol = symbol ? decodeURIComponent(symbol).toUpperCase() : '';
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Instrument[]>([]);
  const [savedWorkspaces, setSavedWorkspaces] = useState<WorkspaceType[]>([]);
  const [snapshot, setSnapshot] = useState<SnapshotResponse | null>(null);
  const [bars, setBars] = useState<BarsResponse | null>(null);
  const [fundamentals, setFundamentals] = useState<FundamentalsResponse | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const runSearch = useCallback(async () => {
    if (!query.trim()) {
      message.warning('请输入股票代码或公司名称');
      return;
    }
    setSearching(true);
    setErrors([]);
    try {
      const response = await searchInstruments(query.trim());
      setSearchResults(response.items);
      if (response.items.length === 0) setErrors(['未找到匹配标的，请尝试交易所代码，例如 AAPL、600519、00700.HK。']);
    } catch (error: any) {
      setSearchResults([]);
      setErrors([error.message || '标的搜索失败']);
    } finally {
      setSearching(false);
    }
  }, [query]);

  useEffect(() => {
    if (currentSymbol) return;
    listResearchWorkspaces()
      .then(setSavedWorkspaces)
      .catch((error) => setErrors([error.message || '加载研究历史失败']));
  }, [currentSymbol]);

  const loadWorkspace = useCallback(async () => {
    if (!currentSymbol) return;
    setLoading(true);
    setErrors([]);
    setSnapshot(null);
    setBars(null);
    setFundamentals(null);
    const outcomes = await Promise.allSettled([
      fetchInstrumentSnapshot(currentSymbol),
      fetchInstrumentBars(currentSymbol, 260),
      fetchInstrumentFundamentals(currentSymbol),
      fetchResearchWorkspace(currentSymbol),
    ]);
    const nextErrors: string[] = [];
    if (outcomes[0].status === 'fulfilled') setSnapshot(outcomes[0].value);
    else nextErrors.push(`行情：${outcomes[0].reason?.message ?? '加载失败'}`);
    if (outcomes[1].status === 'fulfilled') setBars(outcomes[1].value);
    else nextErrors.push(`K线：${outcomes[1].reason?.message ?? '加载失败'}`);
    if (outcomes[2].status === 'fulfilled') setFundamentals(outcomes[2].value);
    else nextErrors.push(`基本面：${outcomes[2].reason?.message ?? '加载失败'}`);
    if (outcomes[3].status === 'fulfilled') {
      setNotes(outcomes[3].value.notes ?? '');
      setSaved(outcomes[3].value.saved);
    } else {
      nextErrors.push(`研究笔记：${outcomes[3].reason?.message ?? '加载失败'}`);
    }
    setErrors(nextErrors);
    setLoading(false);
  }, [currentSymbol]);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);

  const evidence = useMemo(() => provenanceEvidence(snapshot, bars, fundamentals), [snapshot, bars, fundamentals]);

  const saveWorkspace = async () => {
    if (!snapshot) {
      message.error('行情快照未加载，无法保存可追溯研究');
      return;
    }
    setSaving(true);
    try {
      await saveResearchWorkspace(currentSymbol, {
        name: snapshot.instrument.name,
        instrument: snapshot.instrument,
        notes,
        evidence,
        snapshot,
      });
      setSaved(true);
      message.success('研究已按标的合并保存');
    } catch (error: any) {
      message.error(error.message || '保存研究失败');
    } finally {
      setSaving(false);
    }
  };

  if (!currentSymbol) {
    return (
      <main className="product-page research-home" data-testid="research-home">
        <section className="page-hero compact-hero">
          <Text className="eyebrow">INSTRUMENT RESEARCH</Text>
          <Title level={2}>从一个标的，建立可追溯的研究记录</Title>
          <Paragraph>统一查询 A 股、港股和美股；每个数字都显示来源、截止时间和质量标记。</Paragraph>
          <Space.Compact block className="instrument-search">
            <Input
              aria-label="股票代码或公司名称"
              placeholder="搜索股票代码或公司名称，例如 AAPL、600519、00700.HK"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onPressEnter={() => void runSearch()}
              size="large"
            />
            <Button type="primary" size="large" icon={<SearchOutlined />} loading={searching} onClick={() => void runSearch()}>
              搜索标的
            </Button>
          </Space.Compact>
        </section>

        {errors.map((error) => <Alert key={error} type="error" showIcon message={error} style={{ marginBottom: 12 }} />)}

        {searchResults.length > 0 && (
          <Card title={`搜索结果 · ${searchResults.length}`} className="surface-card" data-testid="instrument-search-results">
            <List
              dataSource={searchResults}
              renderItem={(item) => (
                <List.Item
                  actions={[<Button key="open" data-testid={`instrument-result-${item.symbol}`} type="link" onClick={() => navigate(`/research/${encodeURIComponent(item.symbol)}`)}>打开研究页 <ArrowRightOutlined /></Button>]}
                >
                  <List.Item.Meta
                    title={<Space><Text strong>{item.name}</Text><Tag>{item.symbol}</Tag></Space>}
                    description={`${item.market} · ${item.exchange} · ${item.currency} · ${item.asset_type}`}
                  />
                </List.Item>
              )}
            />
          </Card>
        )}

        <Card title="已保存研究" className="surface-card" style={{ marginTop: 18 }} data-testid="saved-research-list">
          {savedWorkspaces.length ? (
            <List
              dataSource={savedWorkspaces}
              renderItem={(item) => (
                <List.Item actions={[<Button key="open" onClick={() => navigate(`/research/${encodeURIComponent(item.symbol)}`)}>继续研究</Button>]}>
                  <List.Item.Meta
                    title={<Space><Text strong>{item.name ?? item.symbol}</Text><Tag>{item.symbol}</Tag></Space>}
                    description={`一条标的记录 · 最后更新 ${item.updated_at ?? '未知'}`}
                  />
                </List.Item>
              )}
            />
          ) : <Empty description="暂无保存记录；同一标的会合并为一条持续更新的研究工作区" />}
        </Card>
        <Button type="link" icon={<FileSearchOutlined />} onClick={() => navigate('/research/reports')} style={{ marginTop: 12 }}>
          打开原多智能体深度报告与历史导出
        </Button>
      </main>
    );
  }

  const priceUp = (snapshot?.data.change_percent ?? 0) >= 0;
  return (
    <main className="product-page" data-testid="instrument-research-page">
      <div className="workspace-toolbar">
        <Button onClick={() => navigate('/research')}>返回标的搜索</Button>
        <Space wrap>
          <Button icon={<FileSearchOutlined />} onClick={() => navigate(`/research/reports?symbol=${encodeURIComponent(currentSymbol)}`)}>AI 深度报告</Button>
          <Button icon={<ExperimentOutlined />} onClick={() => navigate(`/strategy-lab/ma-crossover?symbol=${encodeURIComponent(currentSymbol)}`)}>
            在策略实验室打开
          </Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void saveWorkspace()}>
            {saved ? '更新研究' : '保存研究'}
          </Button>
        </Space>
      </div>

      {errors.map((error) => <Alert key={error} type="warning" showIcon message={error} action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void loadWorkspace()}>重试</Button>} style={{ marginBottom: 12 }} />)}

      {loading && !snapshot ? <Skeleton active paragraph={{ rows: 10 }} /> : snapshot ? (
        <>
          <section className="instrument-header">
            <div>
              <Text className="eyebrow">{snapshot.instrument.market} · {snapshot.instrument.exchange}</Text>
              <Title level={2}>{snapshot.instrument.name} <Text type="secondary">{snapshot.instrument.symbol}</Text></Title>
              <Space wrap>
                <Tag color="blue">FACT</Tag>
                <Text type="secondary">{snapshot.provider}</Text>
                <Text type="secondary">截止 {snapshot.as_of ?? '未知'}</Text>
                <Text type="secondary">{snapshot.timezone}</Text>
              </Space>
            </div>
            <div className="headline-price">
              <Text type="secondary">当前/最近价格</Text>
              <div className={priceUp ? 'price-up' : 'price-down'}>{snapshot.data.price.toFixed(2)} <small>{snapshot.currency}</small></div>
              <Text className={priceUp ? 'price-up' : 'price-down'}>
                {snapshot.data.change >= 0 ? '+' : ''}{snapshot.data.change.toFixed(2)} ({snapshot.data.change_percent >= 0 ? '+' : ''}{snapshot.data.change_percent.toFixed(2)}%)
              </Text>
            </div>
          </section>

          <Row gutter={[12, 12]} className="snapshot-grid">
            {[
              ['今开', snapshot.data.open], ['最高', snapshot.data.high], ['最低', snapshot.data.low],
              ['昨收', snapshot.data.last_close], ['成交量', snapshot.data.volume], ['市值', snapshot.data.market_cap],
            ].map(([label, value]) => (
              <Col xs={12} sm={8} lg={4} key={String(label)}>
                <Card size="small" className="metric-card"><Statistic title={label} value={value == null ? '—' : formatNumber(Number(value))} /></Card>
              </Col>
            ))}
          </Row>

          <Row gutter={[18, 18]} align="top">
            <Col xs={24} xl={17}>
              <Card title="市场数据与技术指标" className="surface-card">
                {bars ? <ResearchCharts payload={bars} /> : <Empty description="K线数据不可用" />}
              </Card>

              <Card title="基本财务指标" className="surface-card" style={{ marginTop: 18 }}>
                {fundamentals?.items.length ? (
                  <Row gutter={[12, 12]}>
                    {fundamentals.items.map((item: FundamentalItem) => (
                      <Col xs={24} sm={12} lg={8} key={item.metric}>
                        <div className="fundamental-tile">
                          <Text type="secondary">{metricLabels[item.metric] ?? item.metric}</Text>
                          <div className="fundamental-value">{formatNumber(item.value, item.currency)}</div>
                          <Text type="secondary">{item.period_type ?? '时点'} · {item.as_of}</Text>
                        </div>
                      </Col>
                    ))}
                  </Row>
                ) : <Empty description="提供方未返回基本面指标；未用 0 或模型数字替代" />}
              </Card>

              <Card title="研究笔记" className="surface-card" style={{ marginTop: 18 }}>
                <Alert type="info" showIcon message="这里保存的是你的研究笔记；任何 AI 生成内容必须显式标为 MODEL_OUTPUT。" style={{ marginBottom: 12 }} />
                <TextArea
                  aria-label="研究笔记"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="记录当前趋势、主要风险与下一步需要核验的事项……"
                  autoSize={{ minRows: 7, maxRows: 16 }}
                />
              </Card>
            </Col>

            <Col xs={24} xl={7}>
              <Card title="证据与来源" className="surface-card evidence-sidebar">
                <List
                  dataSource={evidence}
                  locale={{ emptyText: '暂无可用证据' }}
                  renderItem={(item) => (
                    <List.Item>
                      <div>
                        <Space><Tag color="blue">{item.label}</Tag><Text strong>{item.title}</Text></Space>
                        <Paragraph style={{ margin: '8px 0 4px' }}>{item.detail}</Paragraph>
                        <Text type="secondary">{item.provider ?? '来源未知'} · {item.as_of ?? '时间未知'}</Text>
                      </div>
                    </List.Item>
                  )}
                />
              </Card>

              <Card title="数据质量" className="surface-card" style={{ marginTop: 18 }}>
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="频率">{bars?.frequency ?? snapshot.frequency}</Descriptions.Item>
                  <Descriptions.Item label="复权">{bars?.adjustment ?? '不适用'}</Descriptions.Item>
                  <Descriptions.Item label="币种">{snapshot.currency}</Descriptions.Item>
                  <Descriptions.Item label="时区">{snapshot.timezone}</Descriptions.Item>
                </Descriptions>
                {[...(snapshot.quality_flags ?? []), ...(bars?.quality_flags ?? []), ...(fundamentals?.quality_flags ?? [])].length ? (
                  <Space wrap>
                    {[...(snapshot.quality_flags ?? []), ...(bars?.quality_flags ?? []), ...(fundamentals?.quality_flags ?? [])].map((flag) => <Tag key={flag} color="gold">{flag}</Tag>)}
                  </Space>
                ) : <Tag color="green">未发现质量标记</Tag>}
              </Card>
            </Col>
          </Row>
        </>
      ) : <Empty description="标的行情不可用" />}
    </main>
  );
}
