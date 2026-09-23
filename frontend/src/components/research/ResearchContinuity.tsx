import { Alert, Card, Col, Empty, List, Row, Space, Statistic, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';

import { compareReportViewpoints, reportCoreText, reportUrls } from '../../features/researchContinuity';
import { reportThesisPath, thesisAlertPath } from '../../features/researchTracking';
import type {
  ResearchDiscussionSummary, ResearchReportDetail, ResearchThesisSummary,
} from '../../types/research';
import { useLanguage } from '../../i18n/LanguageContext';

const { Paragraph, Text } = Typography;

const reportStatus = {
  completed: { color: 'green' },
  running: { color: 'blue' },
  failed: { color: 'red' },
} as const;

const thesisDrift = {
  stable: { color: 'green' },
  drifted: { color: 'red' },
  unknown: { color: 'default' },
} as const;

type Translate = (key: string, values?: Record<string, string | number>) => string;

function refreshMessage(t: Translate, currentAsOf?: string | null, savedAsOf?: string | null) {
  if (!savedAsOf) return t('research.continuity.noSnapshot');
  if (!currentAsOf) return t('research.continuity.currentUnknown', { saved: savedAsOf });
  return currentAsOf === savedAsOf
    ? t('research.continuity.unchanged', { value: currentAsOf })
    : t('research.continuity.refreshed', { saved: savedAsOf, current: currentAsOf });
}

export default function ResearchContinuity({
  symbol,
  currentAsOf,
  savedAsOf,
  workspaceUpdatedAt,
  notes,
  reports,
  discussions,
  theses,
  errors,
  loading = false,
}: {
  symbol: string;
  currentAsOf?: string | null;
  savedAsOf?: string | null;
  workspaceUpdatedAt?: string | null;
  notes: string;
  reports: ResearchReportDetail[];
  discussions: ResearchDiscussionSummary[];
  theses: ResearchThesisSummary[];
  errors: string[];
  loading?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <Card
      title={t('research.continuity.title')}
      className="surface-card research-continuity"
      loading={loading}
      extra={<Space wrap><Link to={`/research/reports?symbol=${encodeURIComponent(symbol)}`}>{t('research.continuity.deep')}</Link><Link to={`/discussion?topic=${encodeURIComponent(t('research.continuity.reviewTopic', { symbol }))}`}>{t('research.continuity.review')}</Link></Space>}
    >
      {errors.map((error) => <Alert key={error} type="warning" showIcon message={error} style={{ marginBottom: 8 }} />)}
      <Alert type={savedAsOf && currentAsOf !== savedAsOf ? 'info' : 'warning'} showIcon message={refreshMessage(t, currentAsOf, savedAsOf)} />

      <Row gutter={[12, 12]} className="research-continuity-stats">
        <Col xs={12} md={6}><Statistic title={t('research.continuity.reportVersions')} value={reports.length} /></Col>
        <Col xs={12} md={6}><Statistic title={t('research.continuity.discussions')} value={discussions.length} /></Col>
        <Col xs={12} md={6}><Statistic title={t('research.continuity.theses')} value={theses.length} /></Col>
        <Col xs={12} md={6}><Statistic title={t('research.continuity.notes')} value={t(notes.trim() ? 'research.continuity.recorded' : 'research.continuity.notRecorded')} /></Col>
      </Row>

      <Row gutter={[12, 12]} align="top">
        <Col xs={24} xl={12}>
          <Card size="small" title={t('research.continuity.reportsTitle')}>
            <Alert type="info" showIcon message={compareReportViewpoints(reports, t)} style={{ marginBottom: 10 }} />
            {reports.length ? (
              <List
                dataSource={reports}
                renderItem={(report) => {
                  const status = reportStatus[report.status] ?? reportStatus.failed;
                  const urls = reportUrls(report);
                  return (
                    <List.Item actions={[
                      <Link key="open" to={reportThesisPath(symbol, report.id)}>{t('research.continuity.openVersion')}</Link>,
                      report.status === 'completed' ? <Link key="thesis" to={reportThesisPath(symbol, report.id)}>{t('research.continuity.createThesis')}</Link> : null,
                    ].filter(Boolean)}>
                      <div className="research-continuity-item">
                        <Space wrap><Text strong>{t('research.continuity.version', { id: report.id })}</Text><Tag color={status.color}>{t(`research.continuity.status.${report.status}`)}</Tag><Text type="secondary">{report.created_at}</Text></Space>
                        <Paragraph ellipsis={{ rows: 3, expandable: true, symbol: t('research.continuity.expand') }} style={{ margin: '6px 0' }}>
                          {reportCoreText(report) ?? t('research.continuity.noCore')}
                        </Paragraph>
                        <Tag>{t('research.continuity.citations', { count: urls.length })}</Tag>
                        {urls.slice(0, 3).map((url) => <a key={url} href={url} target="_blank" rel="noreferrer">{new URL(url).hostname}</a>)}
                        {!urls.length && <Text type="secondary"> {t('research.continuity.noUrls')}</Text>}
                      </div>
                    </List.Item>
                  );
                }}
              />
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('research.continuity.noReports')} />}
          </Card>
        </Col>

        <Col xs={24} xl={12}>
          <Card size="small" title={t('research.continuity.discussionTitle')}>
            <Text type="secondary">{t('research.continuity.discussionScope')}</Text>
            {discussions.length ? (
              <List
                dataSource={discussions}
                renderItem={(discussion) => (
                  <List.Item actions={[<Link key="open" to={`/discussion?room=${discussion.id}`}>{t('research.continuity.openDiscussion')}</Link>]}>
                    <div className="research-continuity-item">
                      <Space wrap><Text strong>{discussion.topic}</Text><Tag color="purple">MODEL_OUTPUT</Tag><Text type="secondary">{discussion.created_at}</Text></Space>
                      <Paragraph ellipsis={{ rows: 6, expandable: true, symbol: t('research.continuity.expand') }} style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>
                        {discussion.summary ?? t('research.continuity.noSummary')}
                      </Paragraph>
                    </div>
                  </List.Item>
                )}
              />
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('research.continuity.noDiscussions')} />}
          </Card>
        </Col>

        <Col xs={24} xl={12}>
          <Card size="small" title={t('research.continuity.thesisTitle')}>
            {theses.length ? (
              <List
                dataSource={theses}
                renderItem={(thesis) => {
                  const drift = thesisDrift[thesis.drift_status];
                  return (
                    <List.Item actions={[<Link key="open" to={`/thesis?id=${thesis.id}`}>{t('research.continuity.openThesis')}</Link>, <Link key="alert" to={thesisAlertPath(thesis)}>{t('research.continuity.setAlert')}</Link>]}>
                      <div className="research-continuity-item">
                        <Space wrap><Text strong>{thesis.title}</Text><Tag>{thesis.status}</Tag><Tag color={drift.color}>{t(`research.continuity.drift.${thesis.drift_status}`)}</Tag></Space>
                        <div><Text type="secondary">{t('research.continuity.thesisSource', { source: thesis.source_report_id ? `#${thesis.source_report_id}` : t('research.continuity.manual'), updated: thesis.updated_at })}</Text></div>
                      </div>
                    </List.Item>
                  );
                }}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('research.continuity.noTheses')}>
                <Link to={`/thesis?new=1&ticker=${encodeURIComponent(symbol)}`}>{t('research.continuity.createPrefilled')}</Link>
              </Empty>
            )}
          </Card>
        </Col>

        <Col xs={24} xl={12}>
          <Card size="small" title={t('research.continuity.notesTitle')}>
            <Paragraph>{notes.trim() || t('research.continuity.noNotes')}</Paragraph>
            <Text type="secondary">{t('research.continuity.lastSaved', { value: workspaceUpdatedAt ?? t('research.continuity.neverSaved') })}</Text>
            <Alert type="warning" showIcon message={t('research.continuity.notesBoundary')} style={{ marginTop: 10 }} />
          </Card>
        </Col>
      </Row>
    </Card>
  );
}
