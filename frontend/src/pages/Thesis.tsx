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
import { useLanguage } from '../i18n/LanguageContext';


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
  holding: { labelKey: 'thesis.claimStatus.holding', color: 'green' },
  confirmed: { labelKey: 'thesis.claimStatus.confirmed', color: 'blue' },
  violated: { labelKey: 'thesis.claimStatus.violated', color: 'red' },
  unknown: { labelKey: 'thesis.claimStatus.unknown', color: 'default' },
} as const;

const driftStatus = {
  stable: { labelKey: 'thesis.driftStatus.stable', color: 'green' },
  drifted: { labelKey: 'thesis.driftStatus.drifted', color: 'red' },
  unknown: { labelKey: 'thesis.driftStatus.unknown', color: 'default' },
} as const;

const claimKind = {
  manual: 'thesis.claimKind.manual',
  price: 'thesis.claimKind.price',
  position: 'thesis.claimKind.position',
  fundamental: 'thesis.claimKind.fundamental',
  report: 'thesis.claimKind.report',
} as const;

const splitLines = (value: string) => value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export default function Thesis() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefillTicker = searchParams.get('ticker')?.trim().toUpperCase() || '';
  const prefillClaim = searchParams.get('claim')?.trim() || '';
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
      setHistoryError(errorMessage(error, t('thesis.error.loadVersions')));
    } finally {
      setHistoryLoading(false);
    }
  }, [t]);

  const loadReviews = useCallback(async (thesisId: number) => {
    setReviewsLoading(true);
    setReviewsError('');
    try {
      const response = await apiClient.get(`/thesis/${thesisId}/reviews`);
      setReviews(response.data.items as ThesisReview[]);
    } catch (error: unknown) {
      setReviews([]);
      setReviewsError(errorMessage(error, t('thesis.error.loadReviews')));
    } finally {
      setReviewsLoading(false);
    }
  }, [t]);

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
      message.error(errorMessage(error, t('thesis.error.loadItems')));
    } finally {
      setLoading(false);
    }
  }, [loadReviews, loadVersions, selected?.id, t]);

  useEffect(() => {
    void loadItems(Number.isInteger(requestedThesisId) && requestedThesisId > 0 ? requestedThesisId : undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (shouldPrefill) {
      setEditing(null);
      form.setFieldsValue({ ticker: prefillTicker, title: '', thesis: '', assumptions: '', claims: prefillClaim, status: 'open' });
      setModalOpen(true);
    }
  }, [form, prefillClaim, prefillTicker, shouldPrefill]);

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
    } : { ticker: prefillTicker, title: '', thesis: '', assumptions: '', claims: prefillClaim, status: 'open' });
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
      message.success(editing ? t('thesis.message.updated') : t('thesis.message.created'));
      await loadItems(response.data.id);
    } catch (error: unknown) {
      message.error(errorMessage(error, t('thesis.error.save')));
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
      message.error(errorMessage(error, t('thesis.error.loadDetail')));
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
      message.success(t('thesis.message.versionRecorded'));
    } catch (error: unknown) {
      setConfirmationError(errorMessage(error, t('thesis.error.saveConfirmation')));
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
      message.success(t('thesis.message.reviewRecorded'));
    } catch (error: unknown) {
      setReviewDecisionError(errorMessage(error, t('thesis.error.saveReview')));
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
      setChallengeError(errorMessage(error, t('thesis.error.challenge')));
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
      setSharePreviewError(errorMessage(error, t('thesis.error.sharePreview')));
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
      setValidationIntentError(errorMessage(error, t('thesis.error.validationExperiment')));
    } finally {
      setValidationIntentLoading(false);
    }
  };

  const challengeSection = (title: string, data: ChallengeItem[]) => (
    <Col xs={24} md={8}>
      <Card title={title} size="small" style={{ height: '100%' }}>
        <List
          dataSource={data}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('thesis.challenge.empty')} /> }}
          renderItem={(item) => (
            <List.Item>
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                <Space wrap>
                  <Tag color="purple">{t('thesis.aiInference')}</Tag>
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
      message.success(response.data.drift_status === 'drifted' ? t('thesis.message.driftDetected') : t('thesis.message.checkCompleted'));
    } catch (error: unknown) {
      message.error(errorMessage(error, t('thesis.error.checkDrift')));
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
      message.error(errorMessage(error, t('thesis.error.updateClaim')));
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>{t('thesis.page.title')}</Title>
          <Text type="secondary">{t('thesis.page.subtitle')}</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadItems()}>{t('thesis.action.refresh')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('thesis.action.new')}</Button>
        </Space>
      </Space>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card title={t('thesis.list.title', { count: items.length })} size="small">
            <List
              loading={loading}
              dataSource={items}
              locale={{ emptyText: <Empty description={t('thesis.list.empty')} /> }}
              renderItem={(item) => (
                <List.Item actions={[<Button key="open" type="link" onClick={() => void selectThesis(item.id)}>{t('thesis.action.open')}</Button>]}>
                  <List.Item.Meta
                    title={<Space>{item.title}<Tag>{item.ticker}</Tag></Space>}
                    description={<Space><Tag color={driftStatus[item.drift_status].color}>{t(driftStatus[item.drift_status].labelKey)}</Tag><Text type="secondary">{item.updated_at}</Text></Space>}
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
                extra={<Space wrap><Link to={thesisAlertPath(selected)}><Button icon={<BellOutlined />}>{t('thesis.action.alert')}</Button></Link><Button onClick={() => void openSharePreview()}>{t('thesis.action.sharePreview')}</Button><Button icon={<ExperimentOutlined />} loading={validationIntentLoading} onClick={() => void createValidationExperiment()}>{t('thesis.action.validationExperiment')}</Button><Button icon={<ExperimentOutlined />} loading={challenging} onClick={() => void challengeCurrentThesis()}>{t('thesis.action.challenge')}</Button><Button icon={<EditOutlined />} onClick={openEdit}>{t('thesis.action.edit')}</Button><Button type="primary" loading={checking} onClick={() => void checkDrift()}>{t('thesis.action.recheck')}</Button></Space>}
              >
                <Row gutter={16}>
                  <Col span={8}><Statistic title={t('thesis.summary.driftStatus')} value={t(driftStatus[selected.drift_status].labelKey)} /></Col>
                  <Col span={8}><Statistic title={t('thesis.summary.driftRatio')} value={selected.drift_score ?? 0} suffix="%" /></Col>
                  <Col span={8}><Statistic title={t('thesis.summary.sourceReport')} value={selected.source_report_id ? `#${selected.source_report_id}` : t('thesis.common.manual')} /></Col>
                </Row>
                <Title level={5}>{t('thesis.section.core')}</Title>
                <Paragraph style={{ whiteSpace: 'pre-wrap' }}>{selected.thesis}</Paragraph>
                <Title level={5}>{t('thesis.section.assumptions')}</Title>
                {selected.assumptions.length ? selected.assumptions.map((item, index) => <Paragraph key={`${index}:${item}`}>• {item}</Paragraph>) : <Text type="secondary">{t('thesis.common.notRecorded')}</Text>}
                {selected.source_report_id ? (
                  <Link to={reportThesisPath(selected.ticker, selected.source_report_id)}>{t('thesis.action.viewSourceReport', { id: selected.source_report_id })}</Link>
                ) : null}
              </Card>

              {validationIntentError ? <Alert type="error" showIcon message={t('thesis.error.validationExperiment')} description={validationIntentError} /> : null}

              {challengeError ? <Alert type="error" showIcon message={t('thesis.error.challenge')} description={challengeError} /> : null}
              {challenge ? (
                <Card title={t('thesis.challenge.title')} size="small">
                  <Alert
                    type="warning"
                    showIcon
                    message={t('thesis.challenge.status', { status: challenge.overall_status })}
                    description={challenge.limitation}
                    style={{ marginBottom: 12 }}
                  />
                  <Row gutter={[12, 12]}>
                    {challengeSection(t('thesis.challenge.counterEvidence'), challenge.strongest_counter_evidence)}
                    {challengeSection(t('thesis.challenge.omittedVariables'), challenge.omitted_variables)}
                    {challengeSection(t('thesis.challenge.fragileAssumptions'), challenge.fragile_assumptions)}
                  </Row>
                </Card>
              ) : null}

              <Card title={t('thesis.review.title')} size="small" loading={reviewsLoading}>
                <Alert
                  type="info"
                  showIcon
                  message={t('thesis.review.note')}
                  style={{ marginBottom: 12 }}
                />
                {reviewsError ? <Alert type="error" showIcon message={t('thesis.error.loadReviews')} description={reviewsError} style={{ marginBottom: 12 }} /> : null}
                <List
                  dataSource={reviews}
                  locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('thesis.review.empty')} /> }}
                  renderItem={(review) => (
                    <List.Item>
                      <Card
                        size="small"
                        style={{ width: '100%' }}
                        title={<Space wrap><Tag color={review.status === 'pending' ? 'gold' : review.status === 'failed' ? 'red' : review.status === 'acknowledged' ? 'green' : 'orange'}>{review.status}</Tag><Tag>{review.quality_status}</Tag><Text type="secondary">{review.engine_version || 'UNKNOWN'}</Text></Space>}
                        extra={review.status === 'pending' ? <Space wrap><Button size="small" onClick={() => openReviewDecision(review, 'acknowledged')}>{t('thesis.review.confirm')}</Button><Button size="small" danger onClick={() => openReviewDecision(review, 'disputed')}>{t('thesis.review.dispute')}</Button></Space> : null}
                      >
                        <Space direction="vertical" size={8} style={{ width: '100%' }}>
                          {review.error ? <Alert type="error" showIcon message={t('thesis.review.upstreamError')} description={review.error} /> : null}
                          {review.changes.map((change) => (
                            <Card key={`${change.claim_id}:${change.rule_id}`} size="small">
                              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                                <Space wrap><Tag color="blue">{t('thesis.computedResult')}</Tag><Tag>{t(claimKind[change.kind as keyof typeof claimKind] || change.kind)}</Tag><Text>{t(claimStatus[change.from_status].labelKey)} → {t(claimStatus[change.to_status].labelKey)}</Text></Space>
                                <Text>{change.reason}</Text>
                                <Text type="secondary">{t('thesis.label.rule', { value: `${change.rule_id}@${change.rule_version}` })}</Text>
                                <Text type="secondary">{t('thesis.label.baselineEvidence', { value: change.baseline_evidence_ids.join(', ') || 'UNKNOWN' })}</Text>
                                <Text type="secondary">{t('thesis.label.newEvidence', { value: change.current_evidence_ids.join(', ') || 'UNKNOWN' })}</Text>
                              </Space>
                            </Card>
                          ))}
                          <Text type="secondary">{t('thesis.label.allEvidence', { value: review.evidence_ids.join(', ') || 'UNKNOWN' })} · {review.created_at}</Text>
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

              <Card title={t('thesis.history.title')} size="small" loading={historyLoading}>
                <Alert
                  type="info"
                  showIcon
                  message={t('thesis.history.note')}
                  style={{ marginBottom: 12 }}
                />
                {historyError ? <Alert type="error" showIcon message={t('thesis.error.loadVersions')} description={historyError} style={{ marginBottom: 12 }} /> : null}
                <List
                  dataSource={versions}
                  locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('thesis.history.empty')} /> }}
                  renderItem={(version) => (
                    <List.Item>
                      <Card
                        size="small"
                        style={{ width: '100%' }}
                        title={<Space wrap><Tag color="blue">v{version.version}</Tag><Text>{version.change_reason}</Text></Space>}
                        extra={<Space wrap><Button size="small" onClick={() => openConfirmation(version, 'acknowledged')}>{t('thesis.history.acknowledge')}</Button><Button size="small" danger onClick={() => openConfirmation(version, 'disputed')}>{t('thesis.history.dispute')}</Button></Space>}
                      >
                        <Space direction="vertical" size={8} style={{ width: '100%' }}>
                          <Text>{version.judgment}</Text>
                          <Text type="secondary">{t('thesis.label.confidence', { value: version.confidence ?? 'UNKNOWN' })} · {version.created_by} · {version.created_at}</Text>
                          <Text type="secondary">{t('thesis.label.supportingEvidence', { value: version.supporting_evidence_ids.join(', ') || 'UNKNOWN' })}</Text>
                          <Text type="secondary">{t('thesis.label.opposingEvidence', { value: version.opposing_evidence_ids.join(', ') || 'UNKNOWN' })}</Text>
                          <Row gutter={[8, 8]}>
                            {Object.entries(version.diff_from_previous).map(([field, change]) => (
                              <Col xs={24} md={12} key={field}>
                                <Card size="small" title={t('thesis.history.change', { field })}>
                                  <Text type="secondary">{t('thesis.history.before', { value: JSON.stringify(change.from) })}</Text><br />
                                  <Text>{t('thesis.history.now', { value: JSON.stringify(change.to) })}</Text>
                                  {change.reason ? <><br /><Text type="secondary">{t('thesis.history.reason', { value: change.reason })}</Text></> : null}
                                </Card>
                              </Col>
                            ))}
                          </Row>
                          {version.confirmations.map((confirmation) => (
                            <Alert
                              key={confirmation.id}
                              type={confirmation.decision === 'acknowledged' ? 'success' : 'warning'}
                              showIcon
                              message={confirmation.decision === 'acknowledged' ? t('thesis.history.userAcknowledged') : t('thesis.history.userDisputed')}
                              description={`${confirmation.reason} · ${confirmation.created_at}`}
                            />
                          ))}
                        </Space>
                      </Card>
                    </List.Item>
                  )}
                />
              </Card>

              <Card title={t('thesis.claims.title')} size="small">
                <Alert
                  type="info"
                  showIcon
                  message={t('thesis.claims.note')}
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
                          aria-label={t('thesis.claims.statusLabel')}
                          value={claim.status}
                          style={{ width: 100 }}
                          options={Object.entries(claimStatus).map(([value, meta]) => ({ value, label: t(meta.labelKey) }))}
                          onChange={(value) => void changeClaimStatus(claim, value)}
                        />,
                      ] : undefined}
                    >
                      <List.Item.Meta
                        title={<Space wrap><Tag color={claimStatus[claim.status].color}>{t(claimStatus[claim.status].labelKey)}</Tag><Tag>{t(claimKind[claim.kind])}</Tag>{claim.claim}</Space>}
                        description={claim.note || t('thesis.claims.notChecked')}
                      />
                    </List.Item>
                  )}
                />
              </Card>

              {selected.last_check?.rules ? (
                <Card title={t('thesis.rules.title')} size="small">
                  <Alert
                    type="info"
                    showIcon
                    message={t('thesis.rules.engine', { version: selected.last_check.engine_version || 'UNKNOWN' })}
                    description={t('thesis.rules.note')}
                    style={{ marginBottom: 12 }}
                  />
                  <List
                    dataSource={Object.entries(selected.last_check.rules)}
                    renderItem={([kind, rule]) => (
                      <List.Item>
                        <List.Item.Meta
                          title={<Space wrap><Tag>{t(claimKind[kind as keyof typeof claimKind] || kind)}</Tag><Tag>{rule.rule_id}@{rule.rule_version}</Tag><Tag color={claimStatus[rule.status].color}>{t(claimStatus[rule.status].labelKey)}</Tag></Space>}
                          description={(
                            <Space direction="vertical" size={4}>
                              <Text>{rule.reason}</Text>
                              <Text type="secondary">{t('thesis.rules.formula', { value: rule.formula || t('thesis.rules.manualReview') })}</Text>
                              <Text type="secondary">{t('thesis.rules.parameters', { value: Object.keys(rule.parameters).length ? JSON.stringify(rule.parameters) : t('thesis.common.none') })}</Text>
                              <Text type="secondary">{t('thesis.label.baselineEvidence', { value: rule.baseline_evidence_ids.join(', ') || 'UNKNOWN' })}</Text>
                              <Text type="secondary">{t('thesis.label.currentEvidence', { value: rule.current_evidence_ids.join(', ') || 'UNKNOWN' })}</Text>
                            </Space>
                          )}
                        />
                      </List.Item>
                    )}
                  />
                </Card>
              ) : null}
            </Space>
          ) : <Card><Empty description={t('thesis.empty.selectOrCreate')} /></Card>}
        </Col>
      </Row>

      <Modal
        title={editing ? t('thesis.modal.editTitle') : t('thesis.modal.newTitle')}
        open={modalOpen}
        okText={t('thesis.action.save')}
        cancelText={t('thesis.action.cancel')}
        onOk={() => void save()}
        onCancel={() => setModalOpen(false)}
        afterOpenChange={hydrateForm}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="ticker" label={t('thesis.form.ticker')} rules={[{ required: true }]}><Input disabled={Boolean(editing)} placeholder="600519 / 00700 / AAPL" /></Form.Item>
          <Form.Item name="title" label={t('thesis.form.title')} rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="thesis" label={t('thesis.form.core')} rules={[{ required: true }]}><Input.TextArea rows={5} /></Form.Item>
          <Form.Item name="assumptions" label={t('thesis.form.assumptions')}><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="claims" label={t('thesis.form.claims')}><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="status" label={t('thesis.form.status')}><Select options={[{ value: 'open', label: t('thesis.status.open') }, { value: 'closed', label: t('thesis.status.closed') }, { value: 'invalidated', label: t('thesis.status.invalidated') }]} /></Form.Item>
        </Form>
      </Modal>
      <Modal
        title={confirmationDecision === 'acknowledged' ? t('thesis.confirmModal.acknowledgeTitle', { version: confirmingVersion?.version ?? '' }) : t('thesis.confirmModal.disputeTitle', { version: confirmingVersion?.version ?? '' })}
        open={Boolean(confirmingVersion)}
        okText={t('thesis.confirmModal.append')}
        cancelText={t('thesis.action.cancel')}
        okButtonProps={{ disabled: !confirmationReason.trim(), loading: confirmationSaving }}
        onOk={() => void saveConfirmation()}
        onCancel={() => setConfirmingVersion(null)}
      >
        {confirmationError ? <Alert type="error" showIcon message={t('thesis.error.saveConfirmation')} description={confirmationError} style={{ marginBottom: 12 }} /> : null}
        <Input.TextArea
          aria-label={t('thesis.confirmModal.reasonAria')}
          rows={4}
          maxLength={2000}
          value={confirmationReason}
          onChange={(event) => setConfirmationReason(event.target.value)}
          placeholder={t('thesis.confirmModal.reasonPlaceholder')}
        />
      </Modal>
      <Modal
        title={reviewDecision === 'acknowledged' ? t('thesis.reviewModal.acknowledgeTitle') : t('thesis.reviewModal.disputeTitle')}
        open={Boolean(decidingReview)}
        okText={t('thesis.reviewModal.append')}
        cancelText={t('thesis.action.cancel')}
        okButtonProps={{ disabled: !reviewReason.trim(), loading: reviewSaving }}
        onOk={() => void saveReviewDecision()}
        onCancel={() => setDecidingReview(null)}
      >
        {reviewDecisionError ? <Alert type="error" showIcon message={t('thesis.error.saveReview')} description={reviewDecisionError} style={{ marginBottom: 12 }} /> : null}
        <Input.TextArea
          aria-label={t('thesis.reviewModal.reasonAria')}
          rows={4}
          maxLength={2000}
          value={reviewReason}
          onChange={(event) => setReviewReason(event.target.value)}
          placeholder={t('thesis.reviewModal.reasonPlaceholder')}
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
