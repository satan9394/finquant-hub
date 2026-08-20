import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Button, Card, Col, Empty, Form, Input, List, Modal, Row, Select, Space, Statistic, Tag, Typography, message,
} from 'antd';
import { BellOutlined, ExperimentOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import apiClient from '../services/api';
import SharePreviewModal from '../components/SharePreviewModal';
import { fetchThesisSharePreview } from '../services/sharePreviewApi';
import type { SharePreview } from '../types/research';
import { reportThesisPath, thesisAlertPath } from '../features/researchTracking';


const { Paragraph, Text, Title } = Typography;

type ClaimStatus = 'holding' | 'confirmed' | 'violated' | 'unknown';
type ThesisStatus = 'open' | 'closed' | 'invalidated';

interface ThesisClaim {
  id: number;
  claim: string;
  kind: 'manual' | 'price' | 'position' | 'fundamental' | 'report';
  status: ClaimStatus;
  note: string;
  checked_at?: string | null;
}

interface ChallengeEvidenceRef {
  evidence_id: string;
  relation: 'supporting' | 'opposing';
  kind: string;
  data_status: string;
  source?: string | null;
  as_of?: string | null;
  retrieved_at?: string | null;
  quality_flags: string[];
}

interface ChallengeItem {
  result_kind: 'AI_INFERENCE';
  quality_status: 'OK' | 'PARTIAL' | 'UNKNOWN';
  summary: string;
  claim?: string | null;
  assumption?: string;
  category?: string;
  severity?: string;
  evidence_refs: ChallengeEvidenceRef[];
}

interface ThesisChallenge {
  thesis_id: number;
  ticker: string;
  generated_at: string;
  result_kind: 'AI_INFERENCE';
  overall_status: 'PARTIAL' | 'UNKNOWN';
  strongest_counter_evidence: ChallengeItem[];
  omitted_variables: ChallengeItem[];
  fragile_assumptions: ChallengeItem[];
  limitation: string;
}

interface ThesisItem {
  id: number;
  ticker: string;
  title: string;
  thesis: string;
  assumptions: string[];
  status: ThesisStatus;
  source_report_id?: number | null;
  drift_status: 'unknown' | 'stable' | 'drifted';
  drift_score?: number | null;
  last_checked_at?: string | null;
  updated_at: string;
  claims?: ThesisClaim[];
  last_check?: {
    engine_version?: string;
    rules?: Record<string, DriftRule>;
  };
}

interface DriftRule {
  rule_id: string;
  rule_version: string;
  status: ClaimStatus;
  reason: string;
  formula?: string | null;
  parameters: Record<string, number | string>;
  baseline_value: unknown;
  current_value: unknown;
  baseline_evidence_ids: string[];
  current_evidence_ids: string[];
}

interface ThesisVersionConfirmation {
  id: number;
  decision: 'acknowledged' | 'disputed';
  reason: string;
  created_at: string;
}

interface ThesisVersion {
  id: number;
  version: number;
  judgment: string;
  confidence?: number | null;
  change_reason: string;
  created_by: string;
  created_at: string;
  supporting_evidence_ids: string[];
  opposing_evidence_ids: string[];
  diff_from_previous: Record<string, { from: unknown; to: unknown; reason?: string }>;
  confirmations: ThesisVersionConfirmation[];
}

interface ThesisReviewChange {
  result_kind: 'COMPUTED_RESULT';
  claim_id: number;
  kind: string;
  from_status: ClaimStatus;
  to_status: ClaimStatus;
  reason: string;
  rule_id: string;
  rule_version: string;
  baseline_evidence_ids: string[];
  current_evidence_ids: string[];
}

interface ThesisReviewEvent {
  id: number;
  event_type: 'created' | 'acknowledged' | 'disputed' | 'check_failed';
  reason: string;
  created_at: string;
}

interface ThesisReview {
  id: number;
  thesis_version_id?: number | null;
  status: 'pending' | 'acknowledged' | 'disputed' | 'failed';
  quality_status: 'OK' | 'PARTIAL' | 'UNKNOWN' | 'UPSTREAM_ERROR';
  engine_version?: string | null;
  changes: ThesisReviewChange[];
  evidence_ids: string[];
  error?: string | null;
  created_at: string;
  events: ThesisReviewEvent[];
}

interface ThesisFormValues {
  ticker: string;
  title: string;
  thesis: string;
  assumptions: string;
  claims: string;
  status: ThesisStatus;
}

const claimStatus = {
  holding: { label: '保持', color: 'green' },
  confirmed: { label: '已确认', color: 'blue' },
  violated: { label: '已违背', color: 'red' },
  unknown: { label: '未知', color: 'default' },
} as const;

const driftStatus = {
  stable: { label: '稳定', color: 'green' },
  drifted: { label: '发生漂移', color: 'red' },
  unknown: { label: '待核验', color: 'default' },
} as const;

const claimKind = {
  manual: '手动论点',
  price: '价格变化',
  position: '持仓变化',
  fundamental: '基本面变化',
  report: '报告观点变化',
} as const;

const splitLines = (value: string) => value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export default function Thesis() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefillTicker = searchParams.get('ticker')?.trim().toUpperCase() || '';
  const shouldPrefill = searchParams.get('new') === '1' && Boolean(prefillTicker);
  const requestedThesisId = Number(searchParams.get('id'));
  const [items, setItems] = useState<ThesisItem[]>([]);
  const [selected, setSelected] = useState<ThesisItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [challenging, setChallenging] = useState(false);
  const [challenge, setChallenge] = useState<ThesisChallenge | null>(null);
  const [challengeError, setChallengeError] = useState('');
  const [validationIntentLoading, setValidationIntentLoading] = useState(false);
  const [validationIntentError, setValidationIntentError] = useState('');
  const [versions, setVersions] = useState<ThesisVersion[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [confirmingVersion, setConfirmingVersion] = useState<ThesisVersion | null>(null);
  const [confirmationDecision, setConfirmationDecision] = useState<'acknowledged' | 'disputed'>('acknowledged');
  const [confirmationReason, setConfirmationReason] = useState('');
  const [confirmationSaving, setConfirmationSaving] = useState(false);
  const [confirmationError, setConfirmationError] = useState('');
  const [reviews, setReviews] = useState<ThesisReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState('');
  const [decidingReview, setDecidingReview] = useState<ThesisReview | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'acknowledged' | 'disputed'>('acknowledged');
  const [reviewReason, setReviewReason] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewDecisionError, setReviewDecisionError] = useState('');
  const [sharePreviewOpen, setSharePreviewOpen] = useState(false);
  const [sharePreviewLoading, setSharePreviewLoading] = useState(false);
  const [sharePreviewError, setSharePreviewError] = useState('');
  const [sharePreview, setSharePreview] = useState<SharePreview | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ThesisItem | null>(null);
  const [form] = Form.useForm<ThesisFormValues>();

  const loadVersions = useCallback(async (thesisId: number) => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const response = await apiClient.get(`/thesis/${thesisId}/versions`);
      setVersions(response.data.items as ThesisVersion[]);
    } catch (error: unknown) {
      setVersions([]);
      setHistoryError(errorMessage(error, '加载版本历史失败'));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadReviews = useCallback(async (thesisId: number) => {
    setReviewsLoading(true);
    setReviewsError('');
    try {
      const response = await apiClient.get(`/thesis/${thesisId}/reviews`);
      setReviews(response.data.items as ThesisReview[]);
    } catch (error: unknown) {
      setReviews([]);
      setReviewsError(errorMessage(error, '加载复盘工作流失败'));
    } finally {
      setReviewsLoading(false);
    }
  }, []);

  const loadItems = useCallback(async (preferredId?: number) => {
    setLoading(true);
    try {
      const response = await apiClient.get('/thesis');
      const next = response.data.items as ThesisItem[];
      setItems(next);
      const targetId = preferredId ?? selected?.id ?? next[0]?.id;
      if (targetId) {
        const detail = await apiClient.get(`/thesis/${targetId}`);
        setSelected(detail.data);
        await Promise.all([loadVersions(targetId), loadReviews(targetId)]);
      } else {
        setSelected(null);
        setVersions([]);
        setReviews([]);
      }
    } catch (error: unknown) {
      message.error(errorMessage(error, '加载投资论文失败'));
    } finally {
      setLoading(false);
    }
  }, [loadReviews, loadVersions, selected?.id]);

  useEffect(() => {
    void loadItems(Number.isInteger(requestedThesisId) && requestedThesisId > 0 ? requestedThesisId : undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (shouldPrefill) {
      setEditing(null);
      setModalOpen(true);
    }
  }, [shouldPrefill]);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = () => {
    if (!selected) return;
    setEditing(selected);
    setModalOpen(true);
  };

  const hydrateForm = (open: boolean) => {
    if (!open) return;
    form.setFieldsValue(editing ? {
      ticker: editing.ticker,
      title: editing.title,
      thesis: editing.thesis,
      assumptions: editing.assumptions.join('\n'),
      claims: (editing.claims ?? []).filter((claim) => claim.kind === 'manual').map((claim) => claim.claim).join('\n'),
      status: editing.status,
    } : { ticker: prefillTicker, title: '', thesis: '', assumptions: '', claims: '', status: 'open' });
  };

  const save = async () => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      assumptions: splitLines(values.assumptions),
      claims: splitLines(values.claims),
    };
    try {
      const response = editing
        ? await apiClient.put(`/thesis/${editing.id}`, payload)
        : await apiClient.post('/thesis', payload);
      setModalOpen(false);
      message.success(editing ? '论文已更新' : '论文已创建');
      await loadItems(response.data.id);
    } catch (error: unknown) {
      message.error(errorMessage(error, '保存投资论文失败'));
    }
  };

  const selectThesis = async (id: number) => {
    try {
      const response = await apiClient.get(`/thesis/${id}`);
      setSelected(response.data);
      await Promise.all([loadVersions(id), loadReviews(id)]);
      setChallenge(null);
      setChallengeError('');
      setValidationIntentError('');
    } catch (error: unknown) {
      message.error(errorMessage(error, '加载论文详情失败'));
    }
  };

  const openConfirmation = (version: ThesisVersion, decision: 'acknowledged' | 'disputed') => {
    setConfirmingVersion(version);
    setConfirmationDecision(decision);
    setConfirmationReason('');
    setConfirmationError('');
  };

  const saveConfirmation = async () => {
    if (!selected || !confirmingVersion || !confirmationReason.trim()) return;
    setConfirmationSaving(true);
    setConfirmationError('');
    try {
      await apiClient.post(`/thesis/${selected.id}/versions/${confirmingVersion.version}/confirm`, {
        decision: confirmationDecision,
        reason: confirmationReason.trim(),
      });
      setConfirmingVersion(null);
      await loadVersions(selected.id);
      message.success('版本确认已追加记录');
    } catch (error: unknown) {
      setConfirmationError(errorMessage(error, '保存版本确认失败'));
    } finally {
      setConfirmationSaving(false);
    }
  };

  const openReviewDecision = (
    review: ThesisReview,
    decision: 'acknowledged' | 'disputed',
  ) => {
    setDecidingReview(review);
    setReviewDecision(decision);
    setReviewReason('');
    setReviewDecisionError('');
  };

  const saveReviewDecision = async () => {
    if (!selected || !decidingReview || !reviewReason.trim()) return;
    setReviewSaving(true);
    setReviewDecisionError('');
    try {
      await apiClient.post(`/thesis/${selected.id}/reviews/${decidingReview.id}/decide`, {
        decision: reviewDecision,
        reason: reviewReason.trim(),
      });
      setDecidingReview(null);
      await loadReviews(selected.id);
      message.success('复盘决定已追加记录');
    } catch (error: unknown) {
      setReviewDecisionError(errorMessage(error, '保存复盘决定失败'));
    } finally {
      setReviewSaving(false);
    }
  };

  const challengeCurrentThesis = async () => {
    if (!selected) return;
    setChallenging(true);
    setChallengeError('');
    try {
      const response = await apiClient.post(`/thesis/${selected.id}/challenge`);
      setChallenge(response.data);
    } catch (error: unknown) {
      setChallenge(null);
      setChallengeError(errorMessage(error, '挑战论文失败'));
    } finally {
      setChallenging(false);
    }
  };

  const openSharePreview = async () => {
    if (!selected) return;
    setSharePreviewOpen(true);
    setSharePreviewLoading(true);
    setSharePreviewError('');
    try {
      setSharePreview(await fetchThesisSharePreview(selected.id));
    } catch (error: unknown) {
      setSharePreview(null);
      setSharePreviewError(errorMessage(error, '私有预览生成失败'));
    } finally {
      setSharePreviewLoading(false);
    }
  };

  const createValidationExperiment = async () => {
    if (!selected) return;
    setValidationIntentLoading(true);
    setValidationIntentError('');
    try {
      await apiClient.get(`/thesis/${selected.id}/validation-experiment`);
      navigate(`/strategy-lab/ma-crossover?validation_thesis_id=${selected.id}`);
    } catch (error: unknown) {
      setValidationIntentError(errorMessage(error, '创建验证实验失败'));
    } finally {
      setValidationIntentLoading(false);
    }
  };

  const challengeSection = (title: string, data: ChallengeItem[]) => (
    <Col xs={24} md={8}>
      <Card title={title} size="small" style={{ height: '100%' }}>
        <List
          dataSource={data}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可回链结果" /> }}
          renderItem={(item) => (
            <List.Item>
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                <Space wrap>
                  <Tag color="purple">AI 推论</Tag>
                  <Tag color={item.quality_status === 'OK' ? 'green' : item.quality_status === 'PARTIAL' ? 'orange' : 'default'}>{item.quality_status}</Tag>
                </Space>
                {item.claim ? <Text strong>{item.claim}</Text> : null}
                {item.assumption ? <Text strong>{item.assumption}</Text> : null}
                <Text>{item.summary}</Text>
                {item.evidence_refs.map((ref) => (
                  <Card key={ref.evidence_id} size="small">
                    <Space direction="vertical" size={2}>
                      <Text code>{ref.evidence_id}</Text>
                      <Text type="secondary">{ref.source || 'UNKNOWN'} · {ref.as_of || ref.retrieved_at || 'UNKNOWN'}</Text>
                      <Space wrap><Tag>{ref.relation}</Tag><Tag>{ref.kind}</Tag><Tag>{ref.data_status}</Tag></Space>
                    </Space>
                  </Card>
                ))}
              </Space>
            </List.Item>
          )}
        />
      </Card>
    </Col>
  );

  const checkDrift = async () => {
    if (!selected) return;
    setChecking(true);
    try {
      const response = await apiClient.post(`/thesis/${selected.id}/check`);
      setSelected(response.data);
      setItems((current) => current.map((item) => item.id === response.data.id ? response.data : item));
      await loadReviews(selected.id);
      message.success(response.data.drift_status === 'drifted' ? '核验完成：检测到论点漂移' : '核验完成');
    } catch (error: unknown) {
      message.error(errorMessage(error, '漂移核验失败'));
    } finally {
      setChecking(false);
    }
  };

  const changeClaimStatus = async (claim: ThesisClaim, status: ClaimStatus) => {
    if (!selected) return;
    try {
      const response = await apiClient.put(`/thesis/${selected.id}/claims/${claim.id}`, { status, note: claim.note });
      setSelected(response.data);
    } catch (error: unknown) {
      message.error(errorMessage(error, '更新论点状态失败'));
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>投资论文追踪</Title>
          <Text type="secondary">用真实行情、持仓、基本面和新报告定期核验原始论点</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadItems()}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建论文</Button>
        </Space>
      </Space>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card title={`论文列表（${items.length}）`} size="small">
            <List
              loading={loading}
              dataSource={items}
              locale={{ emptyText: <Empty description="暂无投资论文" /> }}
              renderItem={(item) => (
                <List.Item onClick={() => void selectThesis(item.id)} style={{ cursor: 'pointer' }}>
                  <List.Item.Meta
                    title={<Space>{item.title}<Tag>{item.ticker}</Tag></Space>}
                    description={<Space><Tag color={driftStatus[item.drift_status].color}>{driftStatus[item.drift_status].label}</Tag><Text type="secondary">{item.updated_at}</Text></Space>}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          {selected ? (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Card
                title={<Space>{selected.title}<Tag>{selected.ticker}</Tag></Space>}
                extra={<Space wrap><Link to={thesisAlertPath(selected)}><Button icon={<BellOutlined />}>设置技术预警</Button></Link><Button onClick={() => void openSharePreview()}>私有分享预览</Button><Button icon={<ExperimentOutlined />} loading={validationIntentLoading} onClick={() => void createValidationExperiment()}>创建验证实验</Button><Button icon={<ExperimentOutlined />} loading={challenging} onClick={() => void challengeCurrentThesis()}>挑战我的论文</Button><Button icon={<EditOutlined />} onClick={openEdit}>编辑</Button><Button type="primary" loading={checking} onClick={() => void checkDrift()}>重新核验</Button></Space>}
              >
                <Row gutter={16}>
                  <Col span={8}><Statistic title="漂移状态" value={driftStatus[selected.drift_status].label} /></Col>
                  <Col span={8}><Statistic title="漂移比例" value={selected.drift_score ?? 0} suffix="%" /></Col>
                  <Col span={8}><Statistic title="来源报告" value={selected.source_report_id ? `#${selected.source_report_id}` : '手动'} /></Col>
                </Row>
                <Title level={5}>核心论文</Title>
                <Paragraph style={{ whiteSpace: 'pre-wrap' }}>{selected.thesis}</Paragraph>
                <Title level={5}>关键假设</Title>
                {selected.assumptions.length ? selected.assumptions.map((item, index) => <Paragraph key={`${index}:${item}`}>• {item}</Paragraph>) : <Text type="secondary">未记录</Text>}
                {selected.source_report_id ? (
                  <Link to={reportThesisPath(selected.ticker, selected.source_report_id)}>查看来源报告 #{selected.source_report_id}</Link>
                ) : null}
              </Card>

              {validationIntentError ? <Alert type="error" showIcon message="创建验证实验失败" description={validationIntentError} /> : null}

              {challengeError ? <Alert type="error" showIcon message="挑战论文失败" description={challengeError} /> : null}
              {challenge ? (
                <Card title="挑战我的论文" size="small">
                  <Alert
                    type="warning"
                    showIcon
                    message={`结果状态：${challenge.overall_status} · 所有条目均为 AI 推论`}
                    description={challenge.limitation}
                    style={{ marginBottom: 12 }}
                  />
                  <Row gutter={[12, 12]}>
                    {challengeSection('最强反证', challenge.strongest_counter_evidence)}
                    {challengeSection('遗漏变量', challenge.omitted_variables)}
                    {challengeSection('脆弱假设', challenge.fragile_assumptions)}
                  </Row>
                </Card>
              ) : null}

              <Card title="证据复盘工作流" size="small" loading={reviewsLoading}>
                <Alert
                  type="info"
                  showIcon
                  message="确定性规则只生成待复核状态；确认或争议只追加事件，不会自动改写论文、版本或置信度。"
                  style={{ marginBottom: 12 }}
                />
                {reviewsError ? <Alert type="error" showIcon message="加载复盘工作流失败" description={reviewsError} style={{ marginBottom: 12 }} /> : null}
                <List
                  dataSource={reviews}
                  locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无需要复核的证据变化" /> }}
                  renderItem={(review) => (
                    <List.Item>
                      <Card
                        size="small"
                        style={{ width: '100%' }}
                        title={<Space wrap><Tag color={review.status === 'pending' ? 'gold' : review.status === 'failed' ? 'red' : review.status === 'acknowledged' ? 'green' : 'orange'}>{review.status}</Tag><Tag>{review.quality_status}</Tag><Text type="secondary">{review.engine_version || 'UNKNOWN'}</Text></Space>}
                        extra={review.status === 'pending' ? <Space wrap><Button size="small" onClick={() => openReviewDecision(review, 'acknowledged')}>确认变化</Button><Button size="small" danger onClick={() => openReviewDecision(review, 'disputed')}>驳回复盘</Button></Space> : null}
                      >
                        <Space direction="vertical" size={8} style={{ width: '100%' }}>
                          {review.error ? <Alert type="error" showIcon message="核验失败 · UPSTREAM_ERROR" description={review.error} /> : null}
                          {review.changes.map((change) => (
                            <Card key={`${change.claim_id}:${change.rule_id}`} size="small">
                              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                                <Space wrap><Tag color="blue">计算结果</Tag><Tag>{claimKind[change.kind as keyof typeof claimKind] || change.kind}</Tag><Text>{claimStatus[change.from_status].label} → {claimStatus[change.to_status].label}</Text></Space>
                                <Text>{change.reason}</Text>
                                <Text type="secondary">规则：{change.rule_id}@{change.rule_version}</Text>
                                <Text type="secondary">基准证据：{change.baseline_evidence_ids.join(', ') || 'UNKNOWN'}</Text>
                                <Text type="secondary">新证据：{change.current_evidence_ids.join(', ') || 'UNKNOWN'}</Text>
                              </Space>
                            </Card>
                          ))}
                          <Text type="secondary">全部证据：{review.evidence_ids.join(', ') || 'UNKNOWN'} · {review.created_at}</Text>
                          {review.events.map((event) => (
                            <Alert
                              key={event.id}
                              type={event.event_type === 'check_failed' ? 'error' : event.event_type === 'acknowledged' ? 'success' : event.event_type === 'disputed' ? 'warning' : 'info'}
                              showIcon
                              message={event.event_type}
                              description={`${event.reason} · ${event.created_at}`}
                            />
                          ))}
                        </Space>
                      </Card>
                    </List.Item>
                  )}
                />
              </Card>

              <Card title="版本历史与确认" size="small" loading={historyLoading}>
                <Alert
                  type="info"
                  showIcon
                  message="版本差异由后端持久化快照计算；确认或争议只追加审计事件，不会改写当前论文、置信度或证据。"
                  style={{ marginBottom: 12 }}
                />
                {historyError ? <Alert type="error" showIcon message="加载版本历史失败" description={historyError} style={{ marginBottom: 12 }} /> : null}
                <List
                  dataSource={versions}
                  locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无版本历史" /> }}
                  renderItem={(version) => (
                    <List.Item>
                      <Card
                        size="small"
                        style={{ width: '100%' }}
                        title={<Space wrap><Tag color="blue">v{version.version}</Tag><Text>{version.change_reason}</Text></Space>}
                        extra={<Space wrap><Button size="small" onClick={() => openConfirmation(version, 'acknowledged')}>确认已审阅</Button><Button size="small" danger onClick={() => openConfirmation(version, 'disputed')}>提出争议</Button></Space>}
                      >
                        <Space direction="vertical" size={8} style={{ width: '100%' }}>
                          <Text>{version.judgment}</Text>
                          <Text type="secondary">置信度：{version.confidence ?? 'UNKNOWN'} · {version.created_by} · {version.created_at}</Text>
                          <Text type="secondary">支持证据：{version.supporting_evidence_ids.join(', ') || 'UNKNOWN'}</Text>
                          <Text type="secondary">反对证据：{version.opposing_evidence_ids.join(', ') || 'UNKNOWN'}</Text>
                          <Row gutter={[8, 8]}>
                            {Object.entries(version.diff_from_previous).map(([field, change]) => (
                              <Col xs={24} md={12} key={field}>
                                <Card size="small" title={`变更：${field}`}>
                                  <Text type="secondary">之前：{JSON.stringify(change.from)}</Text><br />
                                  <Text>现在：{JSON.stringify(change.to)}</Text>
                                  {change.reason ? <><br /><Text type="secondary">理由：{change.reason}</Text></> : null}
                                </Card>
                              </Col>
                            ))}
                          </Row>
                          {version.confirmations.map((confirmation) => (
                            <Alert
                              key={confirmation.id}
                              type={confirmation.decision === 'acknowledged' ? 'success' : 'warning'}
                              showIcon
                              message={confirmation.decision === 'acknowledged' ? '用户已确认' : '用户提出争议'}
                              description={`${confirmation.reason} · ${confirmation.created_at}`}
                            />
                          ))}
                        </Space>
                      </Card>
                    </List.Item>
                  )}
                />
              </Card>

              <Card title="论点状态看板" size="small">
                <Alert
                  type="info"
                  showIcon
                  message="自动条件只比较创建时与当前的真实价格、持仓、基本面和最新报告；未知表示数据不可用，不会补造结果。"
                  style={{ marginBottom: 12 }}
                />
                <List
                  dataSource={selected.claims ?? []}
                  renderItem={(claim) => (
                    <List.Item
                      actions={claim.kind === 'manual' ? [
                        <Select
                          key="status"
                          size="small"
                          value={claim.status}
                          style={{ width: 100 }}
                          options={Object.entries(claimStatus).map(([value, meta]) => ({ value, label: meta.label }))}
                          onChange={(value) => void changeClaimStatus(claim, value)}
                        />,
                      ] : undefined}
                    >
                      <List.Item.Meta
                        title={<Space wrap><Tag color={claimStatus[claim.status].color}>{claimStatus[claim.status].label}</Tag><Tag>{claimKind[claim.kind]}</Tag>{claim.claim}</Space>}
                        description={claim.note || '尚未核验'}
                      />
                    </List.Item>
                  )}
                />
              </Card>

              {selected.last_check?.rules ? (
                <Card title="漂移规则证据" size="small">
                  <Alert
                    type="info"
                    showIcon
                    message={`引擎版本：${selected.last_check.engine_version || 'UNKNOWN'}`}
                    description="状态由后端版本化规则计算；前端不重算。baseline/current 任一缺少 canonical evidence 时保持 UNKNOWN。"
                    style={{ marginBottom: 12 }}
                  />
                  <List
                    dataSource={Object.entries(selected.last_check.rules)}
                    renderItem={([kind, rule]) => (
                      <List.Item>
                        <List.Item.Meta
                          title={<Space wrap><Tag>{claimKind[kind as keyof typeof claimKind] || kind}</Tag><Tag>{rule.rule_id}@{rule.rule_version}</Tag><Tag color={claimStatus[rule.status].color}>{claimStatus[rule.status].label}</Tag></Space>}
                          description={(
                            <Space direction="vertical" size={4}>
                              <Text>{rule.reason}</Text>
                              <Text type="secondary">公式：{rule.formula || 'UNKNOWN / 人工复核'}</Text>
                              <Text type="secondary">参数：{Object.keys(rule.parameters).length ? JSON.stringify(rule.parameters) : '无'}</Text>
                              <Text type="secondary">基准证据：{rule.baseline_evidence_ids.join(', ') || 'UNKNOWN'}</Text>
                              <Text type="secondary">当前证据：{rule.current_evidence_ids.join(', ') || 'UNKNOWN'}</Text>
                            </Space>
                          )}
                        />
                      </List.Item>
                    )}
                  />
                </Card>
              ) : null}
            </Space>
          ) : <Card><Empty description="选择或新建一篇投资论文" /></Card>}
        </Col>
      </Row>

      <Modal
        title={editing ? '编辑投资论文' : '新建投资论文'}
        open={modalOpen}
        okText="保存"
        cancelText="取消"
        onOk={() => void save()}
        onCancel={() => setModalOpen(false)}
        afterOpenChange={hydrateForm}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="ticker" label="股票代码" rules={[{ required: true }]}><Input disabled={Boolean(editing)} placeholder="600519 / 00700 / AAPL" /></Form.Item>
          <Form.Item name="title" label="标题" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="thesis" label="核心论文" rules={[{ required: true }]}><Input.TextArea rows={5} /></Form.Item>
          <Form.Item name="assumptions" label="关键假设（每行一条）"><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="claims" label="手动论点（每行一条）"><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="status" label="状态"><Select options={[{ value: 'open', label: '跟踪中' }, { value: 'closed', label: '已关闭' }, { value: 'invalidated', label: '已失效' }]} /></Form.Item>
        </Form>
      </Modal>
      <Modal
        title={confirmationDecision === 'acknowledged' ? `确认版本 v${confirmingVersion?.version ?? ''}` : `争议版本 v${confirmingVersion?.version ?? ''}`}
        open={Boolean(confirmingVersion)}
        okText="追加记录"
        cancelText="取消"
        okButtonProps={{ disabled: !confirmationReason.trim(), loading: confirmationSaving }}
        onOk={() => void saveConfirmation()}
        onCancel={() => setConfirmingVersion(null)}
      >
        {confirmationError ? <Alert type="error" showIcon message="保存版本确认失败" description={confirmationError} style={{ marginBottom: 12 }} /> : null}
        <Input.TextArea
          aria-label="版本确认原因"
          rows={4}
          maxLength={2000}
          value={confirmationReason}
          onChange={(event) => setConfirmationReason(event.target.value)}
          placeholder="记录核验证据、保留意见或争议原因"
        />
      </Modal>
      <Modal
        title={reviewDecision === 'acknowledged' ? '确认证据变化' : '驳回复盘建议'}
        open={Boolean(decidingReview)}
        okText="追加复盘记录"
        cancelText="取消"
        okButtonProps={{ disabled: !reviewReason.trim(), loading: reviewSaving }}
        onOk={() => void saveReviewDecision()}
        onCancel={() => setDecidingReview(null)}
      >
        {reviewDecisionError ? <Alert type="error" showIcon message="保存复盘决定失败" description={reviewDecisionError} style={{ marginBottom: 12 }} /> : null}
        <Input.TextArea
          aria-label="复盘决定原因"
          rows={4}
          maxLength={2000}
          value={reviewReason}
          onChange={(event) => setReviewReason(event.target.value)}
          placeholder="记录对证据、适用期或判断变化的确认/争议原因"
        />
      </Modal>
      <SharePreviewModal
        open={sharePreviewOpen}
        loading={sharePreviewLoading}
        error={sharePreviewError}
        preview={sharePreview}
        onClose={() => setSharePreviewOpen(false)}
        onRetry={() => void openSharePreview()}
      />
    </div>
  );
}
