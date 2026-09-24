import { Typography } from 'antd';
import { useLanguage } from '../i18n/LanguageContext';

const { Text } = Typography;
export const DEFAULT_CONTEXT_LIMIT = 16_000;

export function estimateContextTokens(value: string): number {
  if (!value) return 0;
  let cjk = 0;
  let other = 0;
  for (const character of value) {
    const codepoint = character.codePointAt(0) ?? 0;
    const isCjk = (codepoint >= 0x3400 && codepoint <= 0x4dbf)
      || (codepoint >= 0x4e00 && codepoint <= 0x9fff)
      || (codepoint >= 0xf900 && codepoint <= 0xfaff);
    if (isCjk) cjk += 1;
    else other += 1;
  }
  return Math.max(1, cjk + Math.ceil(other / 4));
}

export default function ContextBudgetBar({
  value,
  contextLimit = DEFAULT_CONTEXT_LIMIT,
}: {
  value: string;
  contextLimit?: number;
}) {
  const { t } = useLanguage();
  const safeLimit = Number.isFinite(contextLimit) && contextLimit > 0
    ? Math.floor(contextLimit)
    : DEFAULT_CONTEXT_LIMIT;
  const tokens = estimateContextTokens(value);
  const percent = tokens * 100 / safeLimit;
  const color = percent > 85
    ? 'var(--fq-system-error)'
    : percent >= 70 ? 'var(--fq-system-warning)' : 'var(--fq-system-info)';
  const status = percent > 85
    ? t('telemetry.context.high')
    : percent >= 70 ? t('telemetry.context.warning') : t('telemetry.context.safe');
  const visiblePercent = Math.round(percent);
  const widthPercent = Math.min(100, Math.max(0, percent));
  const valueText = t('telemetry.context.value', {
    tokens: countText(tokens),
    limit: countText(safeLimit),
    percent: visiblePercent,
  });

  return (
    <div aria-label={t('telemetry.context.label')} style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', fontSize: 11 }}>
        <Text type="secondary">{t('telemetry.context.label')}</Text>
        <Text style={{ color }} aria-live="polite">{valueText} · {status}</Text>
      </div>
      <div
        role="progressbar"
        aria-label={t('telemetry.context.label')}
        aria-valuemin={0}
        aria-valuemax={safeLimit}
        aria-valuenow={Math.min(tokens, safeLimit)}
        aria-valuetext={`${valueText} · ${status}`}
        style={{ height: 4, marginTop: 4, overflow: 'hidden', borderRadius: 999, background: 'var(--fq-surface-2)' }}
      >
        <div style={{ width: `${widthPercent}%`, height: '100%', borderRadius: 999, background: color, transition: 'width 120ms ease' }} />
      </div>
    </div>
  );
}

function countText(value: number): string {
  return Math.round(value).toLocaleString();
}
