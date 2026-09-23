/* Provider card — CC Switch `ProviderCard.tsx` information hierarchy.
 *
 * Order of information (mirrors ProviderCard.tsx:394-598): avatar → name →
 * status badges → base URL summary → secondary meta → action area on the right
 * (ProviderCard.tsx:601-737). One difference is deliberate: the enable switch is
 * an explicitly labelled local preference (no backend `enabled` column exists),
 * so the card never implies a server-side routing change.
 */
import { Button, Popconfirm, Space, Switch, Tag, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, ExperimentOutlined, StarOutlined } from '@ant-design/icons';
import { useLanguage } from '../../i18n/LanguageContext';
import type { ModelConfig } from '../../types';
import ProviderHealthBadge from './ProviderHealthBadge';
import { modelCredentialLabel, providerTypeLabel } from './providerLabels';
import type { ProviderHealthEntry } from './providerState';

const { Text } = Typography;

export interface ProviderCardProps {
  model: ModelConfig;
  entry?: ProviderHealthEntry;
  testing?: boolean;
  enabled: boolean;
  onEdit: () => void;
  onTest: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
  onToggleEnabled: (enabled: boolean) => void;
}

export default function ProviderCard({
  model,
  entry,
  testing = false,
  enabled,
  onEdit,
  onTest,
  onSetDefault,
  onDelete,
  onToggleEnabled,
}: ProviderCardProps) {
  const { t } = useLanguage();
  const typeLabel = providerTypeLabel(model.provider, t);
  const initial = (model.name || model.provider || '?').trim().slice(0, 1).toUpperCase();

  return (
    <div
      data-testid={`provider-card-${model.id}`}
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        padding: '12px 14px',
        border: '1px solid var(--fq-border)',
        borderRadius: 'var(--fq-radius-md, 8px)',
        background: enabled ? 'var(--fq-surface-1)' : 'var(--fq-bg-subtle)',
        opacity: enabled ? 1 : 0.72,
      }}
    >
      <span
        aria-hidden
        style={{
          flex: '0 0 auto',
          display: 'grid',
          placeItems: 'center',
          width: 32,
          height: 32,
          borderRadius: 8,
          background: 'var(--fq-ai-soft, var(--fq-bg-subtle))',
          color: 'var(--fq-ai-primary)',
          fontWeight: 700,
        }}
      >
        {initial}
      </span>

      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text strong style={{ fontSize: 15 }}>{model.name}</Text>
          {model.is_default === 1 && <Tag color="gold" icon={<StarOutlined />}>{t('models.default')}</Tag>}
          <Tag>{typeLabel}</Tag>
          {!enabled && <Tag color="default">{t('models.card.disabled')}</Tag>}
          <ProviderHealthBadge modelId={model.id} entry={entry} testing={testing} />
        </div>
        <div
          title={model.base_url}
          style={{
            marginTop: 4,
            overflow: 'hidden',
            color: 'var(--fq-text-secondary)',
            fontSize: 12,
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {model.base_url}
        </div>
        <div style={{ marginTop: 2, color: 'var(--fq-text-tertiary)', fontSize: 12 }}>
          {`${model.model_name} · ${modelCredentialLabel(model, t)}`}
        </div>
      </div>

      <Space size={4} wrap style={{ flex: '0 0 auto' }}>
        <Switch
          size="small"
          checked={enabled}
          onChange={(checked) => onToggleEnabled(checked)}
          aria-label={t('models.card.enableToggle', { name: model.name })}
        />
        <span style={{ marginRight: 6, color: 'var(--fq-text-tertiary)', fontSize: 12 }}>
          {enabled ? t('models.card.enabled') : t('models.card.disabled')}
        </span>
        <Button size="small" icon={<EditOutlined />} onClick={onEdit}>{t('models.action.edit')}</Button>
        <Button size="small" icon={<ExperimentOutlined />} loading={testing} onClick={onTest}>
          {t('models.action.test')}
        </Button>
        {model.is_default !== 1 && (
          <Button size="small" icon={<StarOutlined />} onClick={onSetDefault}>
            {t('models.action.setDefault')}
          </Button>
        )}
        <Popconfirm title={t('models.confirmDelete')} onConfirm={onDelete}>
          <Button size="small" danger icon={<DeleteOutlined />}>{t('models.action.delete')}</Button>
        </Popconfirm>
      </Space>
    </div>
  );
}
