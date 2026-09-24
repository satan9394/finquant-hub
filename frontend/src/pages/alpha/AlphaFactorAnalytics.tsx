import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Col, Input, Row, Space, Statistic, Tag, Typography } from 'antd';
import { LineChartOutlined, ReloadOutlined } from '@ant-design/icons';

import FactorIcHistogram, { type IcPoint } from '../../components/charts/FactorIcHistogram';
import QuantileReturnChart, { type QuantileReturns } from '../../components/charts/QuantileReturnChart';
import { parseAlphaObservations } from '../../features/alpha/observations';
import apiClient from '../../services/api';

const { Text } = Typography;

type AnalyticsResponse = {
  status: 'ok' | 'insufficient';
  minimum_valid_periods: number;
  valid_periods: number;
  total_periods: number;
  observation_count: number;
  cache_ttl_seconds: number;
  summary: {
    ic_mean: number | null;
    ic_std: number | null;
    ic_ir: number | null;
    t_stat: number | null;
    monotonicity_score: number | null;
    mean_long_short_turnover: number | null;
    factor_autocorrelation: number | null;
  };
  ic_series: IcPoint[];
  quantile_returns: QuantileReturns;
};

const formatMetric = (value: number | null | undefined, digits = 3) => (
  value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits)
);

function readError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { detail?: unknown } } }).response;
    if (typeof response?.data?.detail === 'string') return response.data.detail;
    if (Array.isArray(response?.data?.detail)) {
      return response.data.detail
        .map((item) => (typeof item === 'object' && item !== null && 'msg' in item ? String(item.msg) : '输入数据无效'))
        .join('；');
    }
  }
  return error instanceof Error ? error.message : String(error);
}

export default function AlphaFactorAnalytics() {
  const [factorId, setFactorId] = useState('');
  const [rawObservations, setRawObservations] = useState('');
  const [loaded, setLoaded] = useState<{ factorId: string; data: AnalyticsResponse } | null>(null);
  const [failure, setFailure] = useState<{ factorId: string; error: string } | null>(null);
  const [loadingId, setLoadingId] = useState('');
  const [loadingAction, setLoadingAction] = useState<'submit' | 'load' | null>(null);
  const [themeVersion, setThemeVersion] = useState(0);
  const requestId = useRef(0);
  const normalizedId = factorId.trim();

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeVersion((version) => version + 1));
    const themeRoot = document.querySelector<HTMLElement>('.app-theme');
    for (const target of [document.documentElement, document.body, themeRoot].filter((item): item is HTMLElement => item !== null)) {
      observer.observe(target, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    }
    return () => observer.disconnect();
  }, []);

  const analyze = async () => {
    if (!normalizedId) return;
    const id = ++requestId.current;
    setLoadingId(normalizedId);
    setLoadingAction('submit');
    try {
      const parsed = parseAlphaObservations(rawObservations);
      await apiClient.post(`/wq/factors/${encodeURIComponent(normalizedId)}/analytics`, {
        observations: parsed.observations,
      });
      const response = await apiClient.get<AnalyticsResponse>(
        `/wq/factors/${encodeURIComponent(normalizedId)}/analytics`,
      );
      if (id !== requestId.current) return;
      setLoaded({ factorId: normalizedId, data: response.data });
      setFailure(null);
    } catch (error) {
      if (id !== requestId.current) return;
      setFailure({ factorId: normalizedId, error: readError(error) });
    } finally {
      if (id === requestId.current) {
        setLoadingId('');
        setLoadingAction(null);
      }
    }
  };

  const loadCached = async () => {
    if (!normalizedId) return;
    const id = ++requestId.current;
    setLoadingId(normalizedId);
    setLoadingAction('load');
    try {
      const response = await apiClient.get<AnalyticsResponse>(
        `/wq/factors/${encodeURIComponent(normalizedId)}/analytics`,
      );
      if (id !== requestId.current) return;
      setLoaded({ factorId: normalizedId, data: response.data });
      setFailure(null);
    } catch (error) {
      if (id !== requestId.current) return;
      setFailure({ factorId: normalizedId, error: readError(error) });
    } finally {
      if (id === requestId.current) {
        setLoadingId('');
        setLoadingAction(null);
      }
    }
  };

  const result = loaded?.factorId === normalizedId ? loaded.data : null;
  const error = failure?.factorId === normalizedId ? failure.error : null;
  const curves = result?.quantile_returns;
  const hasCurves = !!curves && curves.dates.length > 0
    && [curves.q1, curves.q2, curves.q3, curves.q4, curves.q5, curves.long_short]
      .every((series) => series.length === curves.dates.length);
  const icSeries = useMemo(() => result?.ic_series ?? [], [result]);

  return (
    <section aria-label="因子深度分析工坊" data-testid="alpha-factor-analytics" style={{ marginTop: 18 }}>
      <Card
        className="surface-card"
        title={<Space><LineChartOutlined /><span>因子深度分析工坊</span></Space>}
        extra={result && (
          <Tag style={{
            borderColor: result.status === 'ok' ? 'var(--fq-evidence-fact)' : 'var(--fq-evidence-unknown)',
            color: result.status === 'ok' ? 'var(--fq-evidence-fact)' : 'var(--fq-evidence-unknown)',
          }}>
            {result.status === 'ok' ? '样本达标' : '有效期数不足'}
          </Tag>
        )}
      >
        <Text type="secondary">粘贴真实横截面观察；每行包含日期、标的、因子值与对应下一期收益。分析按用户隔离缓存最多一小时，只暂存派生指标，原始观察不会留存；服务重启后需要重新提交。</Text>
        <Input.TextArea
          aria-label="因子观察数据"
          value={rawObservations}
          onChange={(event) => setRawObservations(event.target.value)}
          autoSize={{ minRows: 5, maxRows: 12 }}
          placeholder={'date,symbol,factor,forward_return\n请粘贴真实数据；不会填充示例数值。'}
          style={{ marginTop: 12 }}
        />
        <Space.Compact block style={{ marginTop: 12, marginBottom: 12 }}>
          <Input
            aria-label="因子 ID"
            value={factorId}
            onChange={(event) => setFactorId(event.target.value)}
            onPressEnter={() => void loadCached()}
            placeholder="因子 ID"
            maxLength={128}
          />
          <Button type="primary" icon={<ReloadOutlined />} loading={loadingId === normalizedId && loadingAction === 'submit'} disabled={!normalizedId || !rawObservations.trim()} onClick={() => void analyze()}>
            计算并加载
          </Button>
          <Button loading={loadingId === normalizedId && loadingAction === 'load'} disabled={!normalizedId} onClick={() => void loadCached()}>
            读取缓存
          </Button>
        </Space.Compact>

        {error && <Alert type="warning" showIcon message="因子分析暂不可用" description={error} action={<Button size="small" onClick={() => rawObservations.trim() ? void analyze() : void loadCached()}>重试</Button>} />}
        {result && result.status === 'insufficient' && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message={`有效期数 ${result.valid_periods}/${result.minimum_valid_periods}，汇总统计尚不稳定`}
            description={`收到 ${result.total_periods} 个观测日期；未达最低 ${result.minimum_valid_periods} 个有效期门槛，汇总指标保持未知。图表仅展示实际有效期。`}
          />
        )}

        {result && (
          <>
            <Text type="secondary">数据来源：用户提交的 {result.observation_count} 条观察记录 · 缓存剩余约 ${result.cache_ttl_seconds} 秒</Text>
            <Row gutter={[12, 12]}>
              <Col xs={12} md={8} lg={4}><Card size="small"><Statistic title="平均 IC" value={formatMetric(result.summary.ic_mean)} /></Card></Col>
              <Col xs={12} md={8} lg={4}><Card size="small"><Statistic title="IC 标准差" value={formatMetric(result.summary.ic_std)} /></Card></Col>
              <Col xs={12} md={8} lg={4}><Card size="small"><Statistic title="IC_IR" value={formatMetric(result.summary.ic_ir)} /></Card></Col>
              <Col xs={12} md={8} lg={4}><Card size="small"><Statistic title="t 统计量" value={formatMetric(result.summary.t_stat)} /></Card></Col>
              <Col xs={12} md={8} lg={4}><Card size="small"><Statistic title="分层单调性" value={formatMetric(result.summary.monotonicity_score)} /></Card></Col>
              <Col xs={12} md={8} lg={4}><Card size="small"><Statistic title="多空换手" value={formatMetric(result.summary.mean_long_short_turnover)} suffix="/期" /></Card></Col>
              <Col xs={12} md={8} lg={4}><Card size="small"><Statistic title="因子自相关" value={formatMetric(result.summary.factor_autocorrelation)} /></Card></Col>
            </Row>
            <Card size="small" title="Q1～Q5 分层累计收益" style={{ marginTop: 12 }}>
              {hasCurves ? <QuantileReturnChart data={curves} themeVersion={themeVersion} /> : <Text type="secondary">当前没有完整且对齐的五分位观测曲线。</Text>}
            </Card>
            <Card size="small" title="IC 时序" style={{ marginTop: 12 }}>
              {icSeries.length ? <FactorIcHistogram data={icSeries} themeVersion={themeVersion} /> : <Text type="secondary">当前没有有效 IC 观测期。</Text>}
            </Card>
          </>
        )}
      </Card>
    </section>
  );
}
