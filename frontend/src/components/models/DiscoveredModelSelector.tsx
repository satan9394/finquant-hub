import { useMemo, useState } from 'react';
import { Button, Checkbox, Input, Tag, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useLanguage } from '../../i18n/LanguageContext';

const { Text } = Typography;

interface DiscoveredModelSelectorProps {
  models: string[];
  selectedModels: string[];
  adding: boolean;
  onPick: (model: string) => void;
  onToggle: (model: string, selected: boolean) => void;
  onBatchAdd: () => void;
}

export default function DiscoveredModelSelector({
  models,
  selectedModels,
  adding,
  onPick,
  onToggle,
  onBatchAdd,
}: DiscoveredModelSelectorProps) {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const filteredModels = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return keyword ? models.filter((model) => model.toLowerCase().includes(keyword)) : models;
  }, [models, query]);

  return (
    <section
      aria-label={t('models.discover.title', { count: models.length })}
      data-testid="discovered-model-selector"
      style={{
        display: 'grid',
        gap: 10,
        marginTop: 12,
        padding: 12,
        border: '1px solid var(--fq-border)',
        borderRadius: 8,
        background: 'var(--fq-surface-2)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 2 }}>
          <Text strong>{t('models.discover.title', { count: models.length })}</Text>
          <Text type="secondary">{t('models.discover.pickHint')}</Text>
        </div>
        <Input
          allowClear
          size="small"
          prefix={<SearchOutlined />}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('models.discover.search')}
          aria-label={t('models.discover.search')}
          style={{ width: 220, maxWidth: '100%' }}
        />
      </div>

      <div
        aria-label={t('models.discover.results')}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 210, overflowY: 'auto' }}
      >
        {filteredModels.map((model) => (
          <div
            key={model}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 4px 2px 8px',
              border: '1px solid var(--fq-border)',
              borderRadius: 999,
              background: 'var(--fq-surface-1)',
            }}
          >
            <button
              type="button"
              onClick={() => onPick(model)}
              aria-label={t('models.discover.pick', { name: model })}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: 0,
                border: 0,
                background: 'transparent',
                color: 'var(--fq-text-primary)',
                cursor: 'pointer',
              }}
            >
              <Tag style={{ marginInlineEnd: 0 }}>{model}</Tag>
            </button>
            <Checkbox
              checked={selectedModels.includes(model)}
              onChange={(event) => onToggle(model, event.target.checked)}
              aria-label={t('models.discover.selectForBatch', { name: model })}
            />
          </div>
        ))}
        {filteredModels.length === 0 && <Text type="secondary">{t('models.discover.noMatches')}</Text>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <Text type="secondary">{t('models.discover.batchHint')}</Text>
        <Button
          size="small"
          type="primary"
          loading={adding}
          disabled={selectedModels.length === 0 || adding}
          onClick={onBatchAdd}
        >
          {t('models.discover.batchAdd', { count: selectedModels.length })}
        </Button>
      </div>
    </section>
  );
}
