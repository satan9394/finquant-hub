import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Checkbox, Col, Collapse, Empty, Input, List, Row, Space, Spin, Table, Tag, Typography, message } from 'antd';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

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
import CompareGrid from '../components/CompareGrid';
import { useLanguage } from '../i18n/LanguageContext';

const { Text } = Typography;

function percent(value: number | null | undefined) {
  return value == null ? 'UNKNOWN' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;
}

export default function ComparisonWorkspace() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const storedIds = useMemo(() => readComparisonSelection(), []);
  const [naturalQuery, setNaturalQuery] = useState(searchParams.get('query') ?? '');
  const [candidates, setCandidates] = useState<ComparisonCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [staleCount, setStaleCount] = useState(0);
  const kindLabels: Record<ComparisonKind, string> = {
    research: t('comparison.kind.research'),
    strategy: t('comparison.kind.strategy'),
    portfolio: t('comparison.kind.portfolio'),
  };

  useEffect(() => {
    let active = true;
    Promise.allSettled([listResearchWorkspaces(), listBacktests(true)])
      .then(([research, strategies]) => {
        if (!active) return;
        const errors: string[] = [];
        const workspaces = research.status === 'fulfilled' ? research.value : [];
        const backtests = strategies.status === 'fulfilled' ? strategies.value : [];
        if (research.status === 'rejected') errors.push(t('comparison.loadError.research', { error: research.reason?.message ?? t('comparison.loadFailed') }));
        if (strategies.status === 'rejected') errors.push(t('comparison.loadError.strategy', { error: strategies.reason?.message ?? t('comparison.loadFailed') }));
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
  }, [storedIds, t]);

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

  const createNaturalComparison = () => {
    const terms = naturalQuery.split(/\s*(?:vs\.?|比较|对比|和|与)\s*/i).map((item) => item.trim().toLowerCase()).filter(Boolean);
    const matched = candidates.filter((candidate) => terms.some((term) => `${candidate.title} ${candidate.object}`.toLowerCase().includes(term))).slice(0, MAX_COMPARISON_ITEMS);
    if (matched.length < 2) {
      message.warning(t('comparison.natural.insufficient'));
      return;
    }
    setSelectedIds(saveComparisonSelection(matched.map((item) => item.id)));
  };

  const metricRows = [
    { key: 'totalReturn', metric: t('comparison.metric.totalReturn'), render: (item: ComparisonCandidate) => percent(item.metrics?.totalReturn) },
    { key: 'excessReturn', metric: t('comparison.metric.excessReturn'), render: (item: ComparisonCandidate) => percent(item.metrics?.excessReturn) },
    { key: 'maxDrawdown', metric: t('comparison.metric.maxDrawdown'), render: (item: ComparisonCandidate) => percent(item.metrics?.maxDrawdown) },
    { key: 'annualizedVolatility', metric: t('comparison.metric.volatility'), render: (item: ComparisonCandidate) => percent(item.metrics?.annualizedVolatility) },
    { key: 'tradeCount', metric: t('comparison.metric.tradeCount'), render: (item: ComparisonCandidate) => item.metrics?.tradeCount ?? 'UNKNOWN' },
  ];

  const assessmentMessage = t(`comparison.assessment.${assessment.status}`, {
    differences: assessment.differences.join(t('comparison.separator')) || 'UNKNOWN',
  });

  return (
    <main className="product-page" data-testid="comparison-workspace">
      <TaskPageHeader
        eyebrow={t('comparison.eyebrow')}
        title={t('comparison.title')}
        goal={t('comparison.goal')}
        object={t('comparison.objectCount', { selected: selected.length, max: MAX_COMPARISON_ITEMS })}
        status={loadErrors.length ? t('comparison.status.partial') : loading ? t('comparison.status.loading') : t('comparison.status.ready', { count: candidates.length })}
        statusTone={loadErrors.length ? 'warning' : loading ? 'loading' : 'success'}
      />
      <Input.Search
        size="large"
        value={naturalQuery}
        aria-label={t('comparison.natural.aria')}
        placeholder={t('comparison.natural.placeholder')}
        enterButton={t('comparison.natural.create')}
        onChange={(event) => setNaturalQuery(event.target.value)}
        onSearch={createNaturalComparison}
        style={{ marginBottom: 14 }}
      />

      <Alert
        type="info"
        showIcon
        message={t('comparison.readOnly.title')}
        description={t('comparison.readOnly.description')}
        style={{ marginBottom: 14 }}
      />
      {loadErrors.map((error) => <Alert key={error} type="error" showIcon message={error} style={{ marginBottom: 8 }} />)}
      {staleCount > 0 && (
        <Alert
          type="warning"
          showIcon
          message={t('comparison.stale.title', { count: staleCount })}
          description={t('comparison.stale.description')}
          style={{ marginBottom: 8 }}
        />
      )}

      {selected.length === 2 ? (
        <Card title={t('comparison.grid.title')} className="surface-card" style={{ marginBottom: 14 }}>
          <CompareGrid
            leftName={selected[0].title}
            rightName={selected[1].title}
            rows={metricRows.map((row) => ({ key: row.key, metric: row.metric, left: String(row.render(selected[0])), right: String(row.render(selected[1])), source: `${selected[0].source} / ${selected[1].source}` }))}
            onAsk={(row) => navigate(`/research?mode=fast&prompt=${encodeURIComponent(t('comparison.askPrompt', {
              left: selected[0].title,
              right: selected[1].title,
              metric: row.metric,
              leftValue: row.left,
              rightValue: row.right,
            }))}`)}
          />
        </Card>
      ) : null}

      <Card
        title={t('comparison.section.select')}
        className="surface-card"
        extra={<Button disabled={!selectedIds.length} onClick={clear}>{t('comparison.clear')}</Button>}
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
                      aria-label={t('comparison.selectAria', { kind: kindLabels[item.kind], title: item.title })}
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
        ) : <Empty description={t('comparison.emptyCandidates')} />}
      </Card>

      <Card title={t('comparison.section.evidence')} className="surface-card" style={{ marginTop: 16 }}>
        <Alert
          type={assessment.status === 'comparable' ? 'success' : assessment.status === 'insufficient' ? 'info' : 'warning'}
          showIcon
          message={assessment.status === 'comparable' ? t('comparison.comparable') : t('comparison.restricted')}
          description={assessmentMessage}
          style={{ marginBottom: 12 }}
        />
        {selected.length ? (
          <Table
            rowKey="id"
            pagination={false}
            scroll={{ x: 900 }}
            dataSource={selected}
            columns={[
              { title: t('comparison.column.type'), dataIndex: 'kind', render: (kind: ComparisonKind) => kindLabels[kind] },
              { title: t('comparison.column.object'), dataIndex: 'object' },
              { title: t('comparison.column.asOf'), dataIndex: 'asOf' },
              { title: t('comparison.column.source'), dataIndex: 'source' },
              { title: t('comparison.column.quality'), dataIndex: 'quality' },
              { title: t('comparison.column.evidence'), dataIndex: 'evidence' },
              { title: t('comparison.column.back'), dataIndex: 'href', render: (href: string) => <Link to={href}>{t('comparison.open')}</Link> },
            ]}
          />
        ) : <Empty description={t('comparison.emptySelection')} />}
      </Card>

      <Card
        title={t('comparison.section.manifest')}
        className="surface-card"
        style={{ marginTop: 16 }}
        extra={(
          <Button
            type="primary"
            disabled={!selected.length}
            onClick={() => downloadReproducibilityManifest(manifest)}
          >
            {t('comparison.manifest.download')}
          </Button>
        )}
      >
        <Alert
          type={selected.length ? 'info' : 'warning'}
          showIcon
          message={t('comparison.manifest.summary', { version: manifest.schema_version, count: manifest.entry_count })}
          description={t('comparison.manifest.description', { time: manifest.generated_at })}
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
                { title: t('comparison.column.recordId'), dataIndex: 'record_id' },
                { title: t('comparison.column.type'), dataIndex: 'record_type', render: (kind: ComparisonKind) => kindLabels[kind] },
                { title: t('comparison.column.object'), dataIndex: 'object' },
                { title: t('comparison.column.recordAsOf'), dataIndex: 'record_as_of' },
                { title: t('comparison.column.method'), dataIndex: 'methodology' },
                { title: t('comparison.column.source'), dataIndex: ['provenance', 'provider'] },
                {
                  title: t('comparison.column.missing'),
                  dataIndex: 'missing_fields',
                  render: (fields: string[]) => fields.length ? fields.join(', ') : t('comparison.none'),
                },
              ]}
            />
            <Collapse
              size="small"
              style={{ marginTop: 12 }}
              items={[{
                key: 'json',
                label: t('comparison.manifest.preview'),
                children: (
                  <pre data-testid="reproducibility-json" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12 }}>
                    {serializeReproducibilityManifest(manifest)}
                  </pre>
                ),
              }]}
            />
          </>
        ) : <Empty description={t('comparison.manifest.empty')} />}
      </Card>

      {selected.some((item) => item.contract) && (
        <Card title={t('comparison.section.contract')} className="surface-card" style={{ marginTop: 16 }}>
          <Row gutter={[12, 12]}>
            {selected.filter((item) => item.contract).map((item) => (
              <Col xs={24} xl={12} key={item.id}>
                <Card size="small" title={item.title}>
                  <div><Text strong>{t('comparison.contract.period')}：</Text><Text>{item.contract?.period}</Text></div>
                  <div><Text strong>{t('comparison.contract.parameters')}：</Text><Text>{item.contract?.parameters}</Text></div>
                  <div><Text strong>{t('comparison.contract.costs')}：</Text><Text>{item.contract?.costs}</Text></div>
                  <div><Text strong>{t('comparison.contract.benchmark')}：</Text><Text>{item.contract?.benchmark}</Text></div>
                  <div><Text strong>{t('comparison.contract.source')}：</Text><Text>{item.contract?.source}</Text></div>
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {assessment.status === 'comparable' && (
        <Card title={t('comparison.section.metrics')} className="surface-card" style={{ marginTop: 16 }}>
          <Table
            rowKey="key"
            pagination={false}
            scroll={{ x: 720 }}
            dataSource={metricRows}
            columns={[
              { title: t('comparison.column.metric'), dataIndex: 'metric', fixed: 'left', width: 140 },
              ...selected.map((item) => ({
                title: item.title,
                key: item.id,
                render: (_: unknown, row: (typeof metricRows)[number]) => row.render(item),
              })),
            ]}
          />
          <Text type="secondary">{t('comparison.metrics.note')}</Text>
        </Card>
      )}
    </main>
  );
}
