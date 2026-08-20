import { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Collapse, Empty, Form, Input, InputNumber, List, Popconfirm, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import { ExperimentOutlined } from '@ant-design/icons';

import { alignSimulationReturns, assessAlphaSample, parseAlphaObservations } from '../../features/alpha/observations';
import {
  deleteAlphaStudy, readAlphaStudies, restoreAlphaStudy, saveAlphaStudy, type AlphaStudy,
} from '../../features/alpha/studies';
import {
  correlateAlphaSeries, simulateAlphaLocally, type AlphaCorrelationResult,
  type AlphaSimulationResult, type AlphaTemplate,
} from '../../services/alphaApi';

const { Text } = Typography;
const pct = (value: number | null | undefined) => value == null ? '—' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;
const signed4 = (value: number | null | undefined) => value == null ? 'UNKNOWN' : `${value >= 0 ? '+' : ''}${value.toFixed(4)}`;

type SimulationSnapshot = { studyId?: string; templateId: string; templateName: string; quantile: number; periodsPerYear: number; result: AlphaSimulationResult };

export default function AlphaSimulationWorkbench({ template }: { template: AlphaTemplate | null }) {
  const [raw, setRaw] = useState('');
  const [quantile, setQuantile] = useState(0.2);
  const [periodsPerYear, setPeriodsPerYear] = useState(252);
  const [summary, setSummary] = useState<{ rows: number; dates: number; symbols: number } | null>(null);
  const [snapshot, setSnapshot] = useState<SimulationSnapshot | null>(null);
  const [baseline, setBaseline] = useState<SimulationSnapshot | null>(null);
  const [correlation, setCorrelation] = useState<AlphaCorrelationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [studyName, setStudyName] = useState('');
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [studies, setStudies] = useState(readAlphaStudies);
  const [deletedStudy, setDeletedStudy] = useState<AlphaStudy | null>(null);

  const restoreStudy = (study: AlphaStudy) => {
    setSnapshot({
      studyId: study.id,
      templateId: study.templateId,
      templateName: study.templateName,
      quantile: study.quantile,
      periodsPerYear: study.periodsPerYear,
      result: study.result,
    });
    setQuantile(study.quantile);
    setPeriodsPerYear(study.periodsPerYear);
    setStudyName(study.name);
    setRaw('');
    setSummary(null);
    setBaseline(null);
    setCorrelation(null);
    setSavedMessage(`已恢复：${study.name}`);
  };

  useEffect(() => {
    if (!template) return;
    const latest = readAlphaStudies().find((study) => study.templateId === template.id);
    if (latest) {
      restoreStudy(latest);
    } else {
      setSnapshot(null);
      setRaw('');
      setSummary(null);
      setBaseline(null);
      setCorrelation(null);
      setSavedMessage(null);
    }
  // Restore only when the selected catalogue template changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id]);

  if (!template) {
    return <Card title="3. 使用真实观察数据本地模拟" className="surface-card" style={{ marginTop: 18 }}><Empty description="先选择一个真实字段模板" /></Card>;
  }

  const run = async () => {
    setError(null);
    setCorrelation(null);
    try {
      const parsed = parseAlphaObservations(raw);
      setSummary(parsed.summary);
      setLoading(true);
      const result = await simulateAlphaLocally({ observations: parsed.observations, quantile, periods_per_year: periodsPerYear });
      setSnapshot({ templateId: template.id, templateName: template.name, quantile, periodsPerYear, result });
    } catch (caught: any) {
      setError(caught.message || '本地 Alpha 模拟失败');
    } finally {
      setLoading(false);
    }
  };

  const calculateCorrelation = async () => {
    if (!baseline || !snapshot) return;
    const aligned = alignSimulationReturns(baseline.result, snapshot.result);
    if (aligned.dates.length < 3) {
      setError(`只有 ${aligned.dates.length} 个共同日期；相关性至少需要 3 期。`);
      return;
    }
    setError(null);
    try {
      setCorrelation(await correlateAlphaSeries(aligned.seriesA, aligned.seriesB));
    } catch (caught: any) {
      setError(caught.message || '相关性计算失败');
    }
  };

  const quality = snapshot ? assessAlphaSample(snapshot.result) : null;
  const factorAnalysis = snapshot?.result.factor_analysis;
  const factorAnalysisDetail = !snapshot
    ? '等待本地模拟；至少需要每期 5 个标的、5 个有效期，且因子与下一期收益均非零方差。'
    : !factorAnalysis
      ? '旧保存结果没有因子分析合同；保持 UNKNOWN，需用原始观察数据重新运行。'
      : factorAnalysis.status === 'ok'
        ? `平均 IC ${signed4(factorAnalysis.mean_ic)} · 平均 Rank IC ${signed4(factorAnalysis.mean_rank_ic)} · ICIR ${factorAnalysis.icir?.toFixed(4) ?? 'UNKNOWN'} · 有效 ${factorAnalysis.valid_periods}/${factorAnalysis.total_periods} 期。ICIR 为 Rank IC 时序均值/样本标准差，不做年化。`
        : `数据不足：有效 ${factorAnalysis.valid_periods}/${factorAnalysis.total_periods} 期；要求每期至少 ${factorAnalysis.minimum_assets_per_period} 个标的且至少 ${factorAnalysis.minimum_valid_periods} 个有效期。零方差期不进入计算。`;
  const rows = snapshot?.result.period_returns.map((periodReturn, index) => ({
    date: snapshot.result.equity_curve[index + 1]?.date ?? `period-${index + 1}`,
    periodReturn,
    equity: snapshot.result.equity_curve[index + 1]?.value,
  })) ?? [];

  return (
    <Card title="3. 使用真实观察数据本地模拟" className="surface-card" style={{ marginTop: 18 }} data-testid="alpha-simulation-workbench">
      <Alert
        type="info"
        showIcon
        message={`当前模板：${template.name}`}
        description="factor 必须是用户已计算的当期横截面值，forward_return 必须是对应的下一期收益；页面不会从表达式生成或补造观察数据。"
      />
      <Form layout="vertical" style={{ marginTop: 12 }}>
        <Form.Item label="观察数据（CSV 或 JSON）">
          <Input.TextArea
            aria-label="观察数据"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            autoSize={{ minRows: 7, maxRows: 16 }}
            placeholder={'date,symbol,factor,forward_return\n每个日期至少两个标的；不提供示例数值。'}
          />
        </Form.Item>
        <Row gutter={[12, 0]}>
          <Col xs={12} md={6}><Form.Item label="多空分位"><InputNumber aria-label="多空分位" min={0.01} max={0.5} step={0.05} value={quantile} onChange={(value) => setQuantile(Number(value ?? 0.2))} style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={12} md={6}><Form.Item label="每年期数"><InputNumber aria-label="每年期数" min={1} max={366} value={periodsPerYear} onChange={(value) => setPeriodsPerYear(Number(value ?? 252))} style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={24} md={12} style={{ display: 'flex', alignItems: 'center' }}><Button type="primary" icon={<ExperimentOutlined />} loading={loading} onClick={() => void run()} block>运行本地模拟</Button></Col>
        </Row>
      </Form>
      <Collapse
        defaultActiveKey={['p2-assessment']}
        style={{ marginBottom: 12 }}
        items={[{
          key: 'p2-assessment',
          label: 'P2 专业研究能力评估',
          children: (
            <>
              <Alert
                type="warning"
                showIcon
                message="证据状态与可用结果"
                description="同一批显式观察可独立计算横截面 IC；完整分位与衰减仍需新的真实结果合同。"
              />
              <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
                <Col xs={24} md={8}>
                  <Card size="small" title="IC / Rank IC / ICIR">
                    <Space direction="vertical">
                      <Tag color={factorAnalysis?.status === 'ok' ? 'green' : 'gold'}>{factorAnalysis?.status === 'ok' ? '真实观察可用' : snapshot ? '数据不足或旧合同' : '等待本地模拟'}</Tag>
                      <Text type="secondary">{factorAnalysisDetail}</Text>
                    </Space>
                  </Card>
                </Col>
                <Col xs={24} md={8}>
                  <Card size="small" title="完整分位收益">
                    <Space direction="vertical"><Tag color="gold">设计状态</Tag><Text type="secondary">现有结果只有选定头尾篮子的多空收益；完整分组曲线至少需要稳定的五组横截面和逐组结果合同。</Text></Space>
                  </Card>
                </Col>
                <Col xs={24} md={8}>
                  <Card size="small" title="因子衰减">
                    <Space direction="vertical"><Tag>数据缺口</Tag><Text type="secondary">观察记录没有多期限 forward return，不能从单一期限推断 1/5/10 期衰减。</Text></Space>
                  </Card>
                </Col>
              </Row>
            </>
          ),
        }]}
      />
      {summary && <Text type="secondary">已校验：{summary.rows} 条记录 · {summary.dates} 个日期 · {summary.symbols} 个标的。</Text>}
      {error && <Alert type="error" showIcon message="无法完成本地研究" description={error} style={{ marginTop: 12 }} />}

      {studies.some((study) => study.templateId === template.id) && (
        <Card size="small" title="已保存本地研究" style={{ marginTop: 12 }}>
          <List
            size="small"
            dataSource={studies.filter((study) => study.templateId === template.id)}
            renderItem={(study) => (
              <List.Item actions={[
                <Button key="open" type="link" onClick={() => restoreStudy(study)}>恢复</Button>,
                <Popconfirm key="delete" title="移入本地回收站？" onConfirm={() => {
                  deleteAlphaStudy(study.id);
                  setStudies(readAlphaStudies());
                  setDeletedStudy(study);
                  if (snapshot?.studyId === study.id) setSnapshot(null);
                }}><Button type="link" danger>移入回收站</Button></Popconfirm>,
              ]}
              >
                <List.Item.Meta title={study.name} description={`${study.templateName} · ${study.result.period_returns.length} 期 · ${study.savedAt.slice(0, 10)}`} />
              </List.Item>
            )}
          />
        </Card>
      )}
      {deletedStudy && (
        <Alert
          type="info"
          showIcon
          message={`已移入回收站：${deletedStudy.name}`}
          action={<Button size="small" onClick={() => {
            restoreAlphaStudy(deletedStudy.id);
            setStudies(readAlphaStudies());
            setDeletedStudy(null);
          }}>撤销</Button>}
          style={{ marginTop: 12 }}
        />
      )}

      {snapshot && quality && (
        <div style={{ marginTop: 16 }}>
          <Alert type={quality.status === 'adequate' ? 'success' : 'warning'} showIcon message={quality.message} description={`实际模拟 ${quality.periods} 期；按每年 ${snapshot.periodsPerYear} 期年化，Sharpe 无风险收益按 0，Sortino 目标收益按 0；结果未扣佣金、滑点或税费，仅用于研究比较；短样本年化值可能极端，不作为主要结论。`} />
          <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
            <Col xs={12} md={8} lg={4}><Card size="small" data-testid="alpha-total-return"><Statistic title="区间收益" value={pct(snapshot.result.metrics.total_return)} /></Card></Col>
            <Col xs={12} md={8} lg={4}><Card size="small"><Statistic title="最大回撤" value={pct(snapshot.result.metrics.max_drawdown)} /></Card></Col>
            <Col xs={12} md={8} lg={4}><Card size="small"><Statistic title="平均换手" value={pct(snapshot.result.metrics.average_turnover)} /></Card></Col>
            <Col xs={12} md={8} lg={4}><Card size="small"><Statistic title="正收益期" value={pct(snapshot.result.metrics.positive_period_rate)} /></Card></Col>
            <Col xs={12} md={8} lg={4}><Card size="small"><Statistic title="样本期数" value={quality.periods} /></Card></Col>
            <Col xs={12} md={8} lg={4}><Card size="small"><Statistic title="Sharpe" value={snapshot.result.metrics.sharpe_ratio?.toFixed(3) ?? '—'} /></Card></Col>
          </Row>
          <Space wrap style={{ margin: '12px 0' }}>
            <Button onClick={() => { setBaseline(snapshot); setCorrelation(null); }}>设为相关性基准</Button>
            {baseline && baseline.result !== snapshot.result && <Button onClick={() => void calculateCorrelation()}>计算与基准相关性</Button>}
            {baseline && <Text type="secondary">本地基准：{baseline.templateName} · {baseline.result.period_returns.length} 期</Text>}
          </Space>
          <Space.Compact block style={{ marginBottom: 12 }}>
            <Input aria-label="研究名称" value={studyName} onChange={(event) => setStudyName(event.target.value)} placeholder="为派生结果命名；不会保存观察输入" />
            <Button disabled={!studyName.trim()} onClick={() => {
              try {
                const saved = saveAlphaStudy({
                  name: studyName,
                  templateId: snapshot.templateId,
                  templateName: snapshot.templateName,
                  quantile: snapshot.quantile,
                  periodsPerYear: snapshot.periodsPerYear,
                  result: snapshot.result,
                });
                setStudies(readAlphaStudies());
                setSnapshot({ ...snapshot, studyId: saved.id });
                setSavedMessage(`已保存：${saved.name}`);
              } catch (caught: any) {
                setError(caught.message || '本地研究保存失败');
              }
            }}>保存本地研究</Button>
          </Space.Compact>
          {savedMessage && <Alert type="success" showIcon message={savedMessage} description="仅保存模板、参数和派生结果；原始观察输入未写入本地存储。" />}
          {correlation && (
            <Alert
              type="info"
              showIcon
              message={`相关系数 ${correlation.correlation.toFixed(4)}`}
              description={`p=${correlation.p_value.toFixed(4)} · n=${correlation.n}${correlation.note ? ` · ${correlation.note}` : ''}。相关性不代表因果。`}
            />
          )}
          <Collapse
            style={{ marginTop: 12 }}
            items={[{
              key: 'raw',
              label: '核对每期收益与权益曲线',
              children: <Table rowKey="date" size="small" pagination={false} dataSource={rows} columns={[
                { title: '日期', dataIndex: 'date' },
                { title: '多空收益', dataIndex: 'periodReturn', render: (value: number) => pct(value) },
                { title: '权益', dataIndex: 'equity', render: (value: number) => value?.toFixed(6) ?? '—' },
              ]} />,
            }]}
          />
        </div>
      )}
    </Card>
  );
}
