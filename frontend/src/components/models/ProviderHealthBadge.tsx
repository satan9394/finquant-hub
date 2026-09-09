/* Provider health badge — three states + last check time.
 *
 * Mirrors CC Switch `ProviderHealthBadge.tsx` (healthy / degraded / failed with
 * a dot + label + tooltip) and `ProviderStatusBadge.tsx` (tone mapping, tooltip
 * carrying the detail). States here are honest: `untested` is never rendered as
 * healthy, and a failed test shows the backend's own reason instead of a guess.
 */
import { Tooltip } from 'antd';
import { useLanguage } from '../../i18n/LanguageContext';
import { formatCheckedAt, healthStatusOf, type ProviderHealthEntry } from './providerState';

interface ProviderHealthBadgeProps {
  modelId: number;
  entry?: ProviderHealthEntry;
  /** True while the connection test for this provider is in flight. */
  testing?: boolean;
}

const TONE = {
  untested: {
    color: 'var(--fq-text-tertiary)',
    background: 'color-mix(in srgb, var(--fq-text-tertiary) 12%, transparent)',
    labelKey: 'models.health.untested',
  },
  ok: {
    color: 'var(--fq-opportunity)',
    background: 'color-mix(in srgb, var(--fq-opportunity) 12%, transparent)',
    labelKey: 'models.health.ok',
  },
  error: {
    color: 'var(--fq-system-error)',
    background: 'color-mix(in srgb, var(--fq-system-error) 12%, transparent)',
    labelKey: 'models.health.error',
  },
} as const;

export default function ProviderHealthBadge({ modelId, entry, testing = false }: ProviderHealthBadgeProps) {
  const { t, lang } = useLanguage();
  const status = healthStatusOf(entry);
  const tone = TONE[status];
  const checkedAt = formatCheckedAt(entry?.checkedAt, lang);

  const detail: string[] = [];
  if (testing) detail.push(t('models.health.testing'));
  else if (checkedAt) detail.push(t('models.health.checkedAt', { value: checkedAt }));
  else detail.push(t('models.health.never'));
  if (entry?.message) detail.push(entry.message);
  if (entry?.latencyMs != null) detail.push(t('models.testResult.latency', { value: entry.latencyMs }));

  return (
    <Tooltip title={detail.join(' · ')}>
      <span
        data-testid={`provider-health-${modelId}`}
        data-status={status}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '1px 8px',
          borderRadius: 999,
          background: tone.background,
          color: tone.color,
          fontSize: 11,
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        <span
          aria-hidden
          style={{ width: 6, height: 6, borderRadius: '50%', background: tone.color, flex: '0 0 auto' }}
        />
        {testing ? t('models.health.testing') : t(tone.labelKey)}
        {!testing && checkedAt ? (
          <span style={{ fontWeight: 400, opacity: 0.75 }}>
            {t('models.health.checkedAt', { value: checkedAt })}
          </span>
        ) : null}
      </span>
    </Tooltip>
  );
}
