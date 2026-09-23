import { Card, Space, Tag, Typography } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined, PauseCircleOutlined } from '@ant-design/icons';
import RoleAvatar from './RoleAvatar';
import { useLanguage } from '../i18n/LanguageContext';

export type AgentStatus = 'waiting' | 'running' | 'completed' | 'failed' | 'cancelled';

const statusMap: Record<AgentStatus, { labelKey: string; color?: string; icon: React.ReactNode }> = {
  waiting: { labelKey: 'agent.status.waiting', icon: <PauseCircleOutlined /> },
  running: { labelKey: 'agent.status.running', color: 'processing', icon: <LoadingOutlined spin /> },
  completed: { labelKey: 'agent.status.completed', color: 'success', icon: <CheckCircleOutlined /> },
  failed: { labelKey: 'agent.status.failed', color: 'error', icon: <CloseCircleOutlined /> },
  cancelled: { labelKey: 'agent.status.cancelled', icon: <PauseCircleOutlined /> },
};

export default function AgentStatusCard({
  name,
  role,
  status,
  stage,
  evidenceCount,
  error,
  avatar,
}: {
  name: string;
  role?: string;
  status: AgentStatus;
  stage?: string;
  evidenceCount?: number;
  error?: string;
  avatar?: string;
}) {
  const { t } = useLanguage();
  const presentation = statusMap[status];
  return (
    <Card size="small" className={`agent-status-card agent-status-card--${status}`}>
      <div className="agent-status-card__inner">
        <RoleAvatar name={name} avatar={avatar} pulsing={status === 'running'} size="small" />
        <div className="agent-status-card__copy">
          <Typography.Text strong>{name}</Typography.Text>
          {role ? <Typography.Text type="secondary">{role}</Typography.Text> : null}
          {stage ? <Typography.Text className="agent-status-card__stage">{stage}</Typography.Text> : null}
          {error ? <Typography.Text type="danger">{error}</Typography.Text> : null}
        </div>
        <Space direction="vertical" align="end" size={4}>
          <Tag color={presentation.color} icon={presentation.icon}>{t(presentation.labelKey)}</Tag>
          {evidenceCount != null ? <Typography.Text type="secondary">{t('agent.evidenceCount', { count: evidenceCount })}</Typography.Text> : null}
        </Space>
      </div>
    </Card>
  );
}
