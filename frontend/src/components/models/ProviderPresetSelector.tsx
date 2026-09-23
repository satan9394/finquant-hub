/* Grouped provider preset selector — CC Switch `ProviderPresetSelector.tsx`.
 *
 * Borrowed behaviour (file:line in BACKLOG-043 evidence):
 * - search box filtering the visible presets ......... ProviderPresetSelector.tsx:72-85, 211-219, 324-344
 * - button grid of presets ........................... ProviderPresetSelector.tsx:397-456
 * - explicit "custom" entry that keeps manual entry .. ProviderPresetSelector.tsx:398-409
 * - empty search result state ........................ ProviderPresetSelector.tsx:411-417
 * - category hint under the grid ..................... ProviderPresetSelector.tsx:502
 *
 * `custom` is deliberately passed through unchanged: the parent decides the
 * base_url, and `presetBaseUrl('custom')` is undefined, so manual values survive.
 */
import { useMemo, useState } from 'react';
import { Button, Empty, Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  filterPresets,
  groupPresetsByCategory,
  type ModelPreset,
  type PresetCategory,
} from '../../features/modelPresets';

interface ProviderPresetSelectorProps {
  value?: string;
  onChange: (presetId: string) => void;
}

const CATEGORY_LABEL_KEY: Record<PresetCategory, string> = {
  domestic: 'models.category.domestic',
  international: 'models.category.international',
  local: 'models.category.local',
};

export default function ProviderPresetSelector({ value, onChange }: ProviderPresetSelectorProps) {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const labelOf = (preset: ModelPreset) => t(preset.labelKey);
    return groupPresetsByCategory(filterPresets(query, labelOf));
  }, [query, t]);

  const matched = groups.reduce((total, group) => total + group.presets.length, 0);

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

  return (
    <div data-testid="provider-preset-selector">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ color: 'var(--fq-text-secondary)', fontSize: 13 }}>{t('models.preset.groupLabel')}</span>
        <Input
          allowClear
          size="small"
          style={{ width: 200 }}
          prefix={<SearchOutlined />}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('models.preset.searchPlaceholder')}
          aria-label={t('models.preset.searchPlaceholder')}
        />
      </div>

      {matched === 0 && (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ margin: '10px 0' }}
          description={t('models.preset.noResults')}
        />
      )}

      {groups.map((group) => (
        <div key={group.category} style={{ marginTop: 10 }}>
          <div
            style={{
              marginBottom: 6,
              color: 'var(--fq-text-tertiary)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '.06em',
            }}
          >
            {t(CATEGORY_LABEL_KEY[group.category])}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6 }}>
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

      <div style={{ marginTop: 10 }}>
        <Button
          type="default"
          style={buttonStyle(value === 'custom')}
          onClick={() => onChange('custom')}
        >
          {t('models.provider.custom')}
        </Button>
      </div>

      <p style={{ margin: '8px 0 0', color: 'var(--fq-text-tertiary)', fontSize: 12 }}>
        {t('models.preset.hint')}
      </p>
    </div>
  );
}
