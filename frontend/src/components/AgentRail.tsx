import { Button, Empty, Tabs, Typography } from 'antd';
import { CloseOutlined, RobotOutlined } from '@ant-design/icons';
import { useLanguage } from '../i18n/LanguageContext';

interface AgentRailProps {
  open: boolean;
  onClose: () => void;
}

export default function AgentRail({ open, onClose }: AgentRailProps) {
  const { t } = useLanguage();
  return (
    <aside className={`agent-rail${open ? ' agent-rail--open' : ''}`} aria-label={t('agent.title')}>
      <div className="agent-rail__header">
        <span><RobotOutlined /> {t('agent.title')}</span>
        <Button type="text" icon={<CloseOutlined />} aria-label={t('agent.close')} onClick={onClose} />
      </div>
      <Tabs
        size="small"
        items={[
          { key: 'plan', label: t('agent.plan'), children: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('agent.idle')} /> },
          { key: 'activity', label: t('agent.activity'), children: <Typography.Text type="secondary">{t('agent.idleHint')}</Typography.Text> },
          { key: 'sources', label: t('agent.sources'), children: <Typography.Text type="secondary">{t('agent.sourceUnknown')}</Typography.Text> },
          { key: 'tasks', label: t('agent.tasks'), children: <Typography.Text type="secondary">{t('agent.taskUnknown')}</Typography.Text> },
        ]}
      />
    </aside>
  );
}
