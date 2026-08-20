import { Alert, Card, Empty, Space, Tag, Timeline, Typography } from 'antd';
import { Link } from 'react-router-dom';

import type { ResearchTimelineEntry } from '../../features/researchTimeline';

const { Text } = Typography;

const sourceLabel = {
  workspace: '研究工作区',
  report: '深度报告',
  thesis: '投资论文',
  portfolio_review: '组合复盘',
} as const;

export default function ResearchTimeline({ entries, errors, loading = false }: {
  entries: ResearchTimelineEntry[];
  errors: string[];
  loading?: boolean;
}) {
  return (
    <Card
      title="研究活动与待办时间线"
      className="surface-card"
      style={{ marginTop: 18 }}
      loading={loading}
      data-testid="research-timeline"
    >
      <Alert
        type="info"
        showIcon
        message="只读聚合，不创建事件"
        description="SERVER_PERSISTED 来自现有后端记录；LOCAL_DERIVED 只来自本机组合复盘摘要。缺失时间保持 UNKNOWN，打开原记录前不会运行研究、核验或通知。"
        style={{ marginBottom: 16 }}
      />
      {errors.map((error) => <Alert key={error} type="warning" showIcon message={error} style={{ marginBottom: 8 }} />)}
      {entries.length ? (
        <Timeline
          items={entries.map((entry) => ({
            color: entry.persistence === 'server' ? 'blue' : 'gray',
            children: (
              <div data-testid={`timeline-${entry.id}`}>
                <Space wrap>
                  <Text strong>{entry.title}</Text>
                  <Tag color={entry.persistence === 'server' ? 'blue' : 'default'}>
                    {entry.persistence === 'server' ? 'SERVER_PERSISTED' : 'LOCAL_DERIVED'}
                  </Tag>
                  <Tag>{sourceLabel[entry.source]}</Tag>
                  <Tag color={entry.status.includes('drifted') || entry.title.includes('漂移') ? 'red' : 'default'}>{entry.status}</Tag>
                </Space>
                <div><Text>{entry.object}</Text></div>
                <div><Text type="secondary">发生/保存：{entry.occurredAt}{entry.dueAt ? ` · 到期：${entry.dueAt}` : ''}</Text></div>
                <div><Text type="secondary">{entry.detail}</Text></div>
                <Link to={entry.href}>打开原记录</Link>
              </div>
            ),
          }))}
        />
      ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可恢复的研究活动或本地复盘待办" />}
    </Card>
  );
}
