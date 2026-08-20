import { Card, Space, Tag, Typography } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined, PauseCircleOutlined } from '@ant-design/icons';
import RoleAvatar from './RoleAvatar';

export type AgentStatus = 'waiting' | 'running' | 'completed' | 'failed' | 'cancelled';

const statusMap: Record<AgentStatus, { label: string; color?: string; icon: React.ReactNode }> = {
  waiting: { label: '等待前置证据', icon: <PauseCircleOutlined /> },
  running: { label: '正在核对', color: 'processing', icon: <LoadingOutlined spin /> },
  completed: { label: '已完成', color: 'success', icon: <CheckCircleOutlined /> },
  failed: { label: '失败，可继续', color: 'error', icon: <CloseCircleOutlined /> },
  cancelled: { label: '已停止，保留结果', icon: <PauseCircleOutlined /> },
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
          <Tag color={presentation.color} icon={presentation.icon}>{presentation.label}</Tag>
          {evidenceCount != null ? <Typography.Text type="secondary">{evidenceCount} 条证据</Typography.Text> : null}
        </Space>
      </div>
    </Card>
  );
}
