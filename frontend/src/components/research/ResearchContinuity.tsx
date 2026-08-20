import { Alert, Card, Col, Empty, List, Row, Space, Statistic, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';

import { compareReportViewpoints, reportCoreText, reportUrls } from '../../features/researchContinuity';
import { reportThesisPath, thesisAlertPath } from '../../features/researchTracking';
import type {
  ResearchDiscussionSummary, ResearchReportDetail, ResearchThesisSummary,
} from '../../types/research';

const { Paragraph, Text } = Typography;

const reportStatus = {
  completed: { label: '已完成', color: 'green' },
  running: { label: '运行中', color: 'blue' },
  failed: { label: '失败', color: 'red' },
} as const;

const thesisDrift = {
  stable: { label: '稳定', color: 'green' },
  drifted: { label: '发生漂移', color: 'red' },
  unknown: { label: '待核验', color: 'default' },
} as const;

function refreshMessage(currentAsOf?: string | null, savedAsOf?: string | null) {
  if (!savedAsOf) return '尚无保存快照，无法比较数据刷新';
  if (!currentAsOf) return `当前截止时间未知；保存快照截止 ${savedAsOf}`;
  return currentAsOf === savedAsOf
    ? `数据截止时间未变化：${currentAsOf}`
    : `数据已刷新：${savedAsOf} → ${currentAsOf}`;
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
  return (
    <Card
      title="持续研究记录"
      className="surface-card research-continuity"
      loading={loading}
      extra={<Space wrap><Link to={`/research/reports?symbol=${encodeURIComponent(symbol)}`}>运行深度研究</Link><Link to={`/discussion?topic=${encodeURIComponent(`${symbol} 多视角审查`)}`}>发起多视角审查</Link></Space>}
    >
      {errors.map((error) => <Alert key={error} type="warning" showIcon message={error} style={{ marginBottom: 8 }} />)}
      <Alert type={savedAsOf && currentAsOf !== savedAsOf ? 'info' : 'warning'} showIcon message={refreshMessage(currentAsOf, savedAsOf)} />

      <Row gutter={[12, 12]} className="research-continuity-stats">
        <Col xs={12} md={6}><Statistic title="报告版本" value={reports.length} /></Col>
        <Col xs={12} md={6}><Statistic title="主题匹配讨论" value={discussions.length} /></Col>
        <Col xs={12} md={6}><Statistic title="投资论文" value={theses.length} /></Col>
        <Col xs={12} md={6}><Statistic title="笔记状态" value={notes.trim() ? '已记录' : '未记录'} /></Col>
      </Row>

      <Row gutter={[12, 12]} align="top">
        <Col xs={24} xl={12}>
          <Card size="small" title="报告版本与观点变化">
            <Alert type="info" showIcon message={compareReportViewpoints(reports)} style={{ marginBottom: 10 }} />
            {reports.length ? (
              <List
                dataSource={reports}
                renderItem={(report) => {
                  const status = reportStatus[report.status] ?? reportStatus.failed;
                  const urls = reportUrls(report);
                  return (
                    <List.Item actions={[
                      <Link key="open" to={reportThesisPath(symbol, report.id)}>查看版本</Link>,
                      report.status === 'completed' ? <Link key="thesis" to={reportThesisPath(symbol, report.id)}>创建论文</Link> : null,
                    ].filter(Boolean)}>
                      <div className="research-continuity-item">
                        <Space wrap><Text strong>版本 #{report.id}</Text><Tag color={status.color}>{status.label}</Tag><Text type="secondary">{report.created_at}</Text></Space>
                        <Paragraph ellipsis={{ rows: 3, expandable: true, symbol: '展开' }} style={{ margin: '6px 0' }}>
                          {reportCoreText(report) ?? '该版本未保存可展示的核心结论'}
                        </Paragraph>
                        <Tag>{`可点击引用 ${urls.length}`}</Tag>
                        {urls.slice(0, 3).map((url) => <a key={url} href={url} target="_blank" rel="noreferrer">{new URL(url).hostname}</a>)}
                        {!urls.length && <Text type="secondary"> 报告记录中未保存 URL；不补造引用。</Text>}
                      </div>
                    </List.Item>
                  );
                }}
              />
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该标的暂无深度报告版本" />}
          </Card>
        </Col>

        <Col xs={24} xl={12}>
          <Card size="small" title="多视角讨论与分歧">
            <Text type="secondary">仅按代码或公司名在讨论主题中匹配；当前 schema 没有标的外键。</Text>
            {discussions.length ? (
              <List
                dataSource={discussions}
                renderItem={(discussion) => (
                  <List.Item actions={[<Link key="open" to={`/discussion?room=${discussion.id}`}>打开讨论</Link>]}>
                    <div className="research-continuity-item">
                      <Space wrap><Text strong>{discussion.topic}</Text><Tag color="purple">MODEL_OUTPUT</Tag><Text type="secondary">{discussion.created_at}</Text></Space>
                      <Paragraph ellipsis={{ rows: 6, expandable: true, symbol: '展开' }} style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>
                        {discussion.summary ?? '讨论尚未生成总结；分歧状态未知。'}
                      </Paragraph>
                    </div>
                  </List.Item>
                )}
              />
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有按主题文字匹配到该标的讨论" />}
          </Card>
        </Col>

        <Col xs={24} xl={12}>
          <Card size="small" title="投资论文与验证条件">
            {theses.length ? (
              <List
                dataSource={theses}
                renderItem={(thesis) => {
                  const drift = thesisDrift[thesis.drift_status];
                  return (
                    <List.Item actions={[<Link key="open" to={`/thesis?id=${thesis.id}`}>查看论文</Link>, <Link key="alert" to={thesisAlertPath(thesis)}>设置预警</Link>]}>
                      <div className="research-continuity-item">
                        <Space wrap><Text strong>{thesis.title}</Text><Tag>{thesis.status}</Tag><Tag color={drift.color}>{drift.label}</Tag></Space>
                        <div><Text type="secondary">来源报告 {thesis.source_report_id ? `#${thesis.source_report_id}` : '手动'} · 更新 {thesis.updated_at}</Text></div>
                      </div>
                    </List.Item>
                  );
                }}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该标的暂无投资论文或验证条件">
                <Link to={`/thesis?new=1&ticker=${encodeURIComponent(symbol)}`}>创建预填论文</Link>
              </Empty>
            )}
          </Card>
        </Col>

        <Col xs={24} xl={12}>
          <Card size="small" title="研究笔记与保存边界">
            <Paragraph>{notes.trim() || '当前没有研究笔记。'}</Paragraph>
            <Text type="secondary">最后保存：{workspaceUpdatedAt ?? '尚未保存'}</Text>
            <Alert type="warning" showIcon message="当前 schema 仅保留最新笔记，不提供修订历史；报告版本仍可独立追溯。" style={{ marginTop: 10 }} />
          </Card>
        </Col>
      </Row>
    </Card>
  );
}
