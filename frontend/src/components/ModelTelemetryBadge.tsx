import { Popover, Space, Typography } from 'antd';
import { useLanguage } from '../i18n/LanguageContext';

const { Text } = Typography;
const ANTHROPIC_CACHE_DISCOUNT = 0.9;

export interface LLMExecutionMetrics {
  model: string;
  ttft_ms: number | null;
  speed_tps: number | null;
  prompt_tokens: number;
  cached_tokens: number;
  cache_hit_rate: number | null;
  completion_tokens: number;
  reasoning_tokens: number;
  context_used: number;
  role_key?: string;
}

function count(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function metric(value: number | null, digits = 1): string {
  return value !== null && Number.isFinite(value) && value >= 0 ? value.toFixed(digits) : '—';
}

function countText(value: number): string {
  return Math.round(value).toLocaleString();
}

export default function ModelTelemetryBadge({ metrics }: { metrics?: LLMExecutionMetrics | null }) {
  const { t } = useLanguage();
  if (!metrics) return null;

  const promptTokens = count(metrics.prompt_tokens);
  const cachedTokens = count(metrics.cached_tokens);
  const cacheHitRate = metrics.cache_hit_rate !== null && Number.isFinite(metrics.cache_hit_rate)
    ? Math.max(0, metrics.cache_hit_rate)
    : promptTokens > 0 ? cachedTokens * 100 / promptTokens : null;
  const model = metrics.model || t('telemetry.model.unknown');
  const cacheSavingsEstimate = /^claude(?:-|$)/i.test(model) && promptTokens > 0
    ? Math.min(90, cachedTokens * ANTHROPIC_CACHE_DISCOUNT * 100 / promptTokens)
    : null;

  const detailRows: Array<[string, string]> = [
    [t('telemetry.promptTokens'), countText(promptTokens)],
    [t('telemetry.cachedTokens'), countText(cachedTokens)],
    [t('telemetry.completionTokens'), countText(count(metrics.completion_tokens))],
    [t('telemetry.reasoningTokens'), countText(count(metrics.reasoning_tokens))],
    [t('telemetry.contextUsed'), countText(count(metrics.context_used))],
  ];
  if (cacheHitRate !== null) {
    detailRows.push([t('telemetry.cacheHitRate'), `${metric(cacheHitRate)}%`]);
  }
  if (metrics.role_key) {
    detailRows.push([t('telemetry.role'), metrics.role_key]);
  }

  return (
    <Popover
      trigger={['hover', 'focus']}
      placement="topLeft"
      title={<span style={{ color: 'var(--fq-text-primary)' }}>{model}</span>}
      content={(
        <div style={{ minWidth: 220, display: 'grid', gap: 6 }}>
          {detailRows.map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <Text type="secondary">{label}</Text>
              <Text strong>{value}</Text>
            </div>
          ))}
          {cacheSavingsEstimate !== null ? (
            <div style={{ marginTop: 4, paddingTop: 6, borderTop: '1px solid var(--fq-border)' }}>
              <Text strong style={{ color: 'var(--fq-opportunity)' }}>
                {t('telemetry.cacheSavingsEstimate', { value: metric(cacheSavingsEstimate) })}
              </Text>
              <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>
                {t('telemetry.cacheSavingsNote')}
              </Text>
            </div>
          ) : cachedTokens > 0 ? (
            <Text type="secondary" style={{ marginTop: 4, fontSize: 11 }}>
              {t('telemetry.cacheEstimateUnavailable')}
            </Text>
          ) : null}
        </div>
      )}
    >
      <span
        role="button"
        tabIndex={0}
        aria-label={t('telemetry.badge.label', { model })}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          maxWidth: '100%',
          padding: '4px 8px',
          border: '1px solid var(--fq-border)',
          borderRadius: 999,
          background: 'var(--fq-surface-2)',
          color: 'var(--fq-text-secondary)',
          fontSize: 12,
          cursor: 'help',
        }}
      >
        <Space size={8} wrap>
          <Text strong style={{ color: 'var(--fq-text-primary)' }}>{model}</Text>
          <span>⚡ {metric(metrics.speed_tps)} tok/s</span>
          <span>⏱ {metrics.ttft_ms === null ? '—' : `${metric(metrics.ttft_ms, 0)}ms`}</span>
          <span>🎯 {cacheHitRate === null ? '—' : `${metric(cacheHitRate)}%`}</span>
          {count(metrics.reasoning_tokens) > 0 && <span>🧠 {countText(count(metrics.reasoning_tokens))}</span>}
        </Space>
      </span>
    </Popover>
  );
}
