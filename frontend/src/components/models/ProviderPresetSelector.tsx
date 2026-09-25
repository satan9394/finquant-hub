/* Protocol-first provider selector with optional quick-fill presets. */
import { useMemo, useState } from 'react';
import { Button, Empty, Input, Tag, Typography } from 'antd';
import { DownOutlined, SearchOutlined } from '@ant-design/icons';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  filterPresets,
  groupPresetsByCategory,
  MODEL_PRESETS,
  type ModelPreset,
  type PresetCategory,
} from '../../features/modelPresets';
import type { ModelConfig } from '../../types';

const { Text } = Typography;
type ProviderProtocol = 'openai-compatible' | 'anthropic';

interface ProviderPresetSelectorProps {
  value?: string;
  onChange: (presetId: string) => void;
  configuredProviders?: ModelConfig[];
}

const CATEGORY_LABEL_KEY: Record<PresetCategory, string> = {
  domestic: 'models.category.domestic',
  international: 'models.category.international',
  local: 'models.category.local',
};

export default function ProviderPresetSelector({ value, onChange, configuredProviders = [] }: ProviderPresetSelectorProps) {
  const { t } = useLanguage();
  const [drawerQuery, setDrawerQuery] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const protocol: ProviderProtocol = value === 'anthropic' || MODEL_PRESETS.find((preset) => preset.id === value)?.protocol === 'anthropic'
    ? 'anthropic'
    : 'openai-compatible';

  const groups = useMemo(() => {
    const labelOf = (preset: ModelPreset) => t(preset.labelKey);
    const available = MODEL_PRESETS.filter((preset) => (preset.protocol ?? 'openai-compatible') === protocol);
    return groupPresetsByCategory(filterPresets(drawerQuery, labelOf, available));
  }, [drawerQuery, protocol, t]);

  const matched = groups.reduce((total, group) => total + group.presets.length, 0);
  const currentProviders = useMemo(() => {
    const seen = new Set<string>();
    return configuredProviders.filter((provider) => {
      const key = `${provider.provider}\u0000${provider.base_url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [configuredProviders]);

  const buttonStyle = (selected: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: '100%',
    height: 'auto',
    padding: '6px 10px',
    borderColor: selected ? 'var(--fq-ai-primary)' : 'var(--fq-border)',
    background: selected ? 'var(--fq-ai-soft, var(--fq-bg-subtle))' : 'var(--fq-surface-1)',
    color: selected ? 'var(--fq-ai-primary)' : 'var(--fq-text-secondary)',
    fontWeight: selected ? 600 : 400,
    textAlign: 'left',
  });

  const chooseProtocol = (next: ProviderProtocol) => {
    if (next !== protocol) {
      setDrawerQuery('');
      setDrawerOpen(false);
      onChange(next === 'anthropic' ? 'anthropic' : 'openai');
    }
  };

  return (
    <div data-testid="provider-preset-selector" style={{ display: 'grid', gap: 12 }}>
      <div role="radiogroup" aria-label={t('models.protocolSelector.label')}>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>{t('models.protocolSelector.label')}</Text>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(230px, 100%), 1fr))', gap: 8 }}>
          {(['openai-compatible', 'anthropic'] as const).map((option) => {
            const selected = protocol === option;
            const key = option === 'anthropic' ? 'anthropic' : 'openai';
            return (
              <label
                key={option}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  minWidth: 0,
                  padding: 12,
                  border: `1px solid ${selected ? 'var(--fq-ai-primary)' : 'var(--fq-border)'}`,
                  borderRadius: 8,
                  background: selected ? 'var(--fq-ai-soft, var(--fq-bg-subtle))' : 'var(--fq-surface-1)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="model-provider-protocol"
                  value={option}
                  checked={selected}
                  onChange={() => chooseProtocol(option)}
                  aria-label={t(`models.protocolSelector.${key}.title`)}
                  style={{ marginTop: 3, accentColor: 'var(--fq-ai-primary)' }}
                />
                <span style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                  <Text strong style={{ color: selected ? 'var(--fq-ai-primary)' : 'var(--fq-text-primary)' }}>
                    {t(`models.protocolSelector.${key}.title`)}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.45 }}>
                    {t(`models.protocolSelector.${key}.description`)}
                  </Text>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {currentProviders.length > 0 && (
        <div
          data-testid="configured-provider-highlights"
          style={{ display: 'grid', gap: 6, padding: '8px 10px', borderInlineStart: '3px solid var(--fq-ai-primary)', background: 'var(--fq-surface-2)' }}
        >
          <Text strong>{t('models.preset.configured')}</Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {currentProviders.map((provider) => {
              const preset = MODEL_PRESETS.find((candidate) => candidate.id === provider.provider);
              const label = preset ? t(preset.labelKey) : provider.name || provider.provider;
              return (
                <Tag
                  key={`${provider.provider}:${provider.base_url}`}
                  title={provider.base_url}
                  style={{ marginInlineEnd: 0, borderColor: 'var(--fq-ai-primary)', background: 'var(--fq-ai-soft, var(--fq-bg-subtle))', color: 'var(--fq-ai-primary)' }}
                >
                  {label}
                </Tag>
              );
            })}
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('models.preset.configuredHint')}</Text>
        </div>
      )}

      <div>
        <Button
          type="text"
          size="small"
          aria-expanded={drawerOpen}
          aria-label={t('models.preset.groupLabel')}
          icon={<DownOutlined rotate={drawerOpen ? 180 : 0} />}
          onClick={() => setDrawerOpen((open) => !open)}
          style={{ paddingInline: 0, color: 'var(--fq-ai-primary)', fontWeight: 600 }}
        >
          {t('models.preset.groupLabel')}
        </Button>
        {drawerOpen && <div data-testid="provider-preset-drawer" style={{ display: 'grid', gap: 10, marginTop: 8, padding: 10, border: '1px solid var(--fq-border)', borderRadius: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>{t('models.preset.protocolHint')}</Text>
            <Input
              allowClear
              size="small"
              style={{ width: 220, maxWidth: '100%' }}
              prefix={<SearchOutlined />}
              value={drawerQuery}
              onChange={(event) => setDrawerQuery(event.target.value)}
              placeholder={t('models.preset.searchPlaceholder')}
              aria-label={t('models.preset.searchPlaceholder')}
            />
          </div>

          {matched === 0 && (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              style={{ margin: '8px 0' }}
              description={t('models.preset.noResults')}
            />
          )}

          {groups.map((group) => (
            <div key={group.category} style={{ display: 'grid', gap: 6 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>{t(CATEGORY_LABEL_KEY[group.category])}</Text>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 6 }}>
                {group.presets.map((preset) => (
                  <Button
                    key={preset.id}
                    type="default"
                    style={buttonStyle(value === preset.id)}
                    onClick={() => onChange(preset.id)}
                  >
                    {t(preset.labelKey)}
                  </Button>
                ))}
              </div>
            </div>
          ))}

          {protocol === 'openai-compatible' && (
            <Button
              type="default"
              style={buttonStyle(value === 'custom')}
              onClick={() => onChange('custom')}
            >
              {t('models.provider.custom')}
            </Button>
          )}
          <Text type="secondary" style={{ fontSize: 12 }}>{t('models.preset.hint')}</Text>
        </div>}
      </div>
    </div>
  );
}
