import { Alert, Card, Empty, Space, Tag, Timeline, Typography } from 'antd';
import { Link } from 'react-router-dom';

import type { ResearchTimelineEntry } from '../../features/researchTimeline';
import { useLanguage } from '../../i18n/LanguageContext';

const { Text } = Typography;

export default function ResearchTimeline({ entries, errors, loading = false }: {
  entries: ResearchTimelineEntry[];
  errors: string[];
  loading?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <Card
      title={t('research.timeline.title')}
      className="surface-card"
      style={{ marginTop: 18 }}
      loading={loading}
      data-testid="research-timeline"
    >
      <Alert
        type="info"
        showIcon
        message={t('research.timeline.readonly')}
        description={t('research.timeline.description')}
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
                  <Tag>{t(`research.timeline.source.${entry.source}`)}</Tag>
                  <Tag color={entry.status.includes('drifted') || entry.title.includes('漂移') ? 'red' : 'default'}>{entry.status}</Tag>
                </Space>
                <div><Text>{entry.object}</Text></div>
                <div><Text type="secondary">{t('research.timeline.occurred', { value: entry.occurredAt })}{entry.dueAt ? ` · ${t('research.timeline.due', { value: entry.dueAt })}` : ''}</Text></div>
                <div><Text type="secondary">{entry.detail}</Text></div>
                <Link to={entry.href}>{t('research.timeline.open')}</Link>
              </div>
            ),
          }))}
        />
      ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('research.timeline.empty')} />}
    </Card>
  );
}
