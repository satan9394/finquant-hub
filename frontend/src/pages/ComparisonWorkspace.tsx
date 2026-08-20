import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Checkbox, Col, Collapse, Empty, List, Row, Space, Spin, Table, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';

import TaskPageHeader from '../components/TaskPageHeader';
import {
  MAX_COMPARISON_ITEMS,
  assessComparison,
  buildComparisonCandidates,
  clearComparisonSelection,
  readComparisonSelection,
  saveComparisonSelection,
  type ComparisonCandidate,
  type ComparisonKind,
} from '../features/comparisonWorkspace';
import {
  buildReproducibilityManifest,
  downloadReproducibilityManifest,
  serializeReproducibilityManifest,
} from '../features/reproducibilityManifest';
import { listBacktests, listResearchWorkspaces } from '../services/researchApi';

const { Text } = Typography;
const kindLabels: Record<ComparisonKind, string> = {
  research: '已保存研究',
  strategy: '已保存策略实验',
  portfolio: '本地组合复盘',
};

function percent(value: number | null | undefined) {
  return value == null ? 'UNKNOWN' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;
}

export default function ComparisonWorkspace() {
  const storedIds = useMemo(() => readComparisonSelection(), []);
  const [candidates, setCandidates] = useState<ComparisonCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [staleCount, setStaleCount] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.allSettled([listResearchWorkspaces(), listBacktests(true)])
      .then(([research, strategies]) => {
        if (!active) return;
        const errors: string[] = [];
        const workspaces = research.status === 'fulfilled' ? research.value : [];
        const backtests = strategies.status === 'fulfilled' ? strategies.value : [];
        if (research.status === 'rejected') errors.push(`已保存研究：${research.reason?.message ?? '加载失败'}`);
        if (strategies.status === 'rejected') errors.push(`已保存策略：${strategies.reason?.message ?? '加载失败'}`);
        const next = buildComparisonCandidates(workspaces, backtests);
        const availableIds = new Set(next.map((item) => item.id));
        const restored = storedIds.filter((id) => availableIds.has(id));
        setCandidates(next);
        setSelectedIds(restored);
        setStaleCount(storedIds.length - restored.length);
        setLoadErrors(errors);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [storedIds]);

  const selected = selectedIds
    .map((id) => candidates.find((candidate) => candidate.id === id))
    .filter((item): item is ComparisonCandidate => item != null);
  const assessment = assessComparison(selected);
  const manifest = useMemo(
    () => buildReproducibilityManifest(selected),
    [candidates, selectedIds],
  );

  const toggle = (id: string, checked: boolean) => {
    const next = checked ? [...selectedIds, id] : selectedIds.filter((item) => item !== id);
    setSelectedIds(saveComparisonSelection(next));
  };

  const clear = () => {
    clearComparisonSelection();
    setSelectedIds([]);
  };

  const metricRows = [
    { key: 'totalReturn', metric: '总收益', render: (item: ComparisonCandidate) => percent(item.metrics?.totalReturn) },
    { key: 'excessReturn', metric: '超额收益', render: (item: ComparisonCandidate) => percent(item.metrics?.excessReturn) },
    { key: 'maxDrawdown', metric: '最大回撤', render: (item: ComparisonCandidate) => percent(item.metrics?.maxDrawdown) },
    { key: 'annualizedVolatility', metric: '年化波动率', render: (item: ComparisonCandidate) => percent(item.metrics?.annualizedVolatility) },
    { key: 'tradeCount', metric: '交易数', render: (item: ComparisonCandidate) => item.metrics?.tradeCount ?? 'UNKNOWN' },
  ];

  return (
    <main className="product-page" data-testid="comparison-workspace">
      <TaskPageHeader
        eyebrow="COMPARISON · EVIDENCE FIRST"
        title="跨对象比较工作区"
        goal="先核对对象、期间、参数、成本、基准和来源，再查看可比指标；跨类型不生成综合分数或推荐。"
        object={`${selected.length}/${MAX_COMPARISON_ITEMS} 个来源记录`}
        status={loadErrors.length ? '部分来源不可用' : loading ? '正在读取已保存记录' : `${candidates.length} 个真实候选`}
        statusTone={loadErrors.length ? 'warning' : loading ? 'loading' : 'success'}
      />

      <Alert
        type="info"
        showIcon
        message="只读取已有记录，选择本身不运行研究或回测"
        description="本机只保存最多四个来源记录 ID；不会复制原始行情、修改持仓、保存实验或写入后端业务数据。"
        style={{ marginBottom: 14 }}
      />
      {loadErrors.map((error) => <Alert key={error} type="error" showIcon message={error} style={{ marginBottom: 8 }} />)}
      {staleCount > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`${staleCount} 个旧选择已跳过`}
          description="对应来源记录已不存在或不再满足已保存/完成合同；未用其他记录替代。"
          style={{ marginBottom: 8 }}
        />
      )}

      <Card
        title="1. 选择已有来源记录"
        className="surface-card"
        extra={<Button disabled={!selectedIds.length} onClick={clear}>清空选择</Button>}
      >
        {loading ? <Spin /> : candidates.length ? (
          <List
            grid={{ gutter: 12, xs: 1, md: 2, xl: 3 }}
            dataSource={candidates}
            renderItem={(item) => {
              const checked = selectedIds.includes(item.id);
              return (
                <List.Item>
                  <Card size="small">
                    <Checkbox
                      checked={checked}
                      disabled={!checked && selectedIds.length >= MAX_COMPARISON_ITEMS}
                      onChange={(event) => toggle(item.id, event.target.checked)}
                      aria-label={`选择${kindLabels[item.kind]}：${item.title}`}
                    >
                      <Text strong>{item.title}</Text>
                    </Checkbox>
                    <Space wrap style={{ marginTop: 10 }}>
                      <Tag>{kindLabels[item.kind]}</Tag>
                      <Tag>{item.object}</Tag>
                    </Space>
                    <div style={{ marginTop: 8 }}><Text type="secondary">{item.source} · {item.asOf}</Text></div>
                    <div><Text type="secondary">{item.evidence}</Text></div>
                  </Card>
                </List.Item>
              );
            }}
          />
        ) : <Empty description="没有满足合同的已保存研究、完成策略实验或本地组合复盘" />}
      </Card>

      <Card title="2. 可比性与证据" className="surface-card" style={{ marginTop: 16 }}>
        <Alert
          type={assessment.status === 'comparable' ? 'success' : assessment.status === 'insufficient' ? 'info' : 'warning'}
          showIcon
          message={assessment.status === 'comparable' ? '同口径策略指标可并排查看' : '数值比较受限'}
          description={assessment.message}
          style={{ marginBottom: 12 }}
        />
        {selected.length ? (
          <Table
            rowKey="id"
            pagination={false}
            scroll={{ x: 900 }}
            dataSource={selected}
            columns={[
              { title: '类型', dataIndex: 'kind', render: (kind: ComparisonKind) => kindLabels[kind] },
              { title: '对象', dataIndex: 'object' },
              { title: '截止/创建时间', dataIndex: 'asOf' },
              { title: '来源', dataIndex: 'source' },
              { title: '质量状态', dataIndex: 'quality' },
              { title: '原始证据', dataIndex: 'evidence' },
              { title: '回到来源', dataIndex: 'href', render: (href: string) => <Link to={href}>打开</Link> },
            ]}
          />
        ) : <Empty description="尚未选择来源记录" />}
      </Card>

      <Card
        title="3. 可复现清单预览"
        className="surface-card"
        style={{ marginTop: 16 }}
        extra={(
          <Button
            type="primary"
            disabled={!selected.length}
            onClick={() => downloadReproducibilityManifest(manifest)}
          >
            下载可复现清单（JSON）
          </Button>
        )}
      >
        <Alert
          type={selected.length ? 'info' : 'warning'}
          showIcon
          message={`schema v${manifest.schema_version} · ${manifest.entry_count} 个显式选择记录`}
          description={`生成时间 ${manifest.generated_at}；下载内容与下方 JSON 预览使用同一对象，不上传或发送。`}
          style={{ marginBottom: 12 }}
        />
        {selected.length ? (
          <>
            <Table
              rowKey="record_id"
              pagination={false}
              scroll={{ x: 900 }}
              dataSource={manifest.entries}
              columns={[
                { title: '记录 ID / 版本', dataIndex: 'record_id' },
                { title: '类型', dataIndex: 'record_type', render: (kind: ComparisonKind) => kindLabels[kind] },
                { title: '对象', dataIndex: 'object' },
                { title: '截止时间', dataIndex: 'record_as_of' },
                { title: '方法', dataIndex: 'methodology' },
                { title: '来源', dataIndex: ['provenance', 'provider'] },
                {
                  title: '缺失字段',
                  dataIndex: 'missing_fields',
                  render: (fields: string[]) => fields.length ? fields.join(', ') : '无',
                },
              ]}
            />
            <Collapse
              size="small"
              style={{ marginTop: 12 }}
              items={[{
                key: 'json',
                label: '查看与下载一致的 JSON',
                children: (
                  <pre data-testid="reproducibility-json" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12 }}>
                    {serializeReproducibilityManifest(manifest)}
                  </pre>
                ),
              }]}
            />
          </>
        ) : <Empty description="先选择至少一个已有来源记录；不会导出未选择内容" />}
      </Card>

      {selected.some((item) => item.contract) && (
        <Card title="4. 策略口径核对" className="surface-card" style={{ marginTop: 16 }}>
          <Row gutter={[12, 12]}>
            {selected.filter((item) => item.contract).map((item) => (
              <Col xs={24} xl={12} key={item.id}>
                <Card size="small" title={item.title}>
                  <div><Text strong>期间：</Text><Text>{item.contract?.period}</Text></div>
                  <div><Text strong>参数：</Text><Text>{item.contract?.parameters}</Text></div>
                  <div><Text strong>成本：</Text><Text>{item.contract?.costs}</Text></div>
                  <div><Text strong>基准：</Text><Text>{item.contract?.benchmark}</Text></div>
                  <div><Text strong>来源口径：</Text><Text>{item.contract?.source}</Text></div>
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {assessment.status === 'comparable' && (
        <Card title="5. 同口径策略原始指标" className="surface-card" style={{ marginTop: 16 }}>
          <Table
            rowKey="key"
            pagination={false}
            scroll={{ x: 720 }}
            dataSource={metricRows}
            columns={[
              { title: '指标', dataIndex: 'metric', fixed: 'left', width: 140 },
              ...selected.map((item) => ({
                title: item.title,
                key: item.id,
                render: (_: unknown, row: (typeof metricRows)[number]) => row.render(item),
              })),
            ]}
          />
          <Text type="secondary">仅并排展示后端已保存指标，不计算统一分数、跨对象排名或投资建议。</Text>
        </Card>
      )}
    </main>
  );
}
