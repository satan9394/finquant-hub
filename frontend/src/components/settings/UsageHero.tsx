import { Card, Col, Empty, Row, Tag, Typography } from 'antd';
import type { ReactNode } from 'react';

import { useLanguage } from '../../i18n/LanguageContext';
import { formatCost } from '../../services/usageApi';
import type { UsageHeroData } from '../../utils/usageStats';

/**
 * Summary card for the usage detail module (BACKLOG-045), modelled on CC
 * Switch's `UsageHero`: headline totals plus the breakdown that matters.
 *
 * Cost follows BACKLOG-044 semantics — a model without a unit price is shown as
 * 「未配置单价」, never as a free (0) amount; mixed currencies are never summed.
 */
export default function UsageHero({ data }: { data: UsageHeroData | null }) {
  const { t } = useLanguage();

  if (!data) {
    return (
      <Card size="small" title={t('settings.usage.hero.title')}>
        <Empty description={t('settings.usage.stats.empty')} data-testid="usage-hero-empty" />
      </Card>
    );
  }

  const hasUsage = data.requestCount > 0 || data.totalTokens > 0;
  const costLabel = (() => {
    switch (data.costStatus) {
      case 'priced':
        return formatCost(data.estimatedCost, data.costCurrency);
      case 'mixed_currency':
        return <Tag>{t('settings.usage.cost.mixedCurrency')}</Tag>;
      case 'partial':
        return (
          <span>
            {formatCost(data.estimatedCost, data.costCurrency)}{' '}
            <Tag>{t('settings.usage.stats.partialUnpriced')}</Tag>
          </span>
        );
      case 'unpriced':
        return <Tag>{t('settings.usage.cost.unpriced')}</Tag>;
      default:
        return '-';
    }
  })();

  const block = (testId: string, title: string, value: ReactNode, hint?: string, span = 4) => (
    <Col xs={12} lg={span}>
      <Typography.Text type="secondary">{title}</Typography.Text>
      <div style={{ fontSize: 20, fontWeight: 600 }} data-testid={testId}>
        {value}
      </div>
      {hint ? <Typography.Text type="secondary">{hint}</Typography.Text> : null}
    </Col>
  );

  return (
    <Card size="small" title={t('settings.usage.hero.title')} data-testid="usage-hero">
      {hasUsage ? (
        <>
          <Row gutter={[16, 8]}>
            {block(
              'usage-hero-total-tokens',
              t('settings.usage.total'),
              data.totalTokens.toLocaleString(),
            )}
            {block('usage-hero-input-tokens', t('settings.usage.input'), data.promptTokens.toLocaleString())}
            {block(
              'usage-hero-output-tokens',
              t('settings.usage.output'),
              data.completionTokens.toLocaleString(),
            )}
            {block(
              'usage-hero-requests',
              t('settings.usage.requests'),
              data.requestCount.toLocaleString(),
            )}
            {block(
              'usage-hero-daily-average',
              t('settings.usage.hero.dailyAverage'),
              data.dailyAverageTokens === null ? '-' : Math.round(data.dailyAverageTokens).toLocaleString(),
            )}
            {block('usage-hero-window-days', t('settings.usage.hero.days'), data.windowDays)}
          </Row>
          <Row gutter={[16, 8]} style={{ marginTop: 12 }}>
            {block(
              'usage-hero-top-model',
              t('settings.usage.hero.topModel'),
              data.topModelKey ?? t('settings.usage.hero.topModelEmpty'),
              data.topModelTokens !== null
                ? `${t('settings.usage.total')}: ${data.topModelTokens.toLocaleString()}`
                : undefined,
            )}
            <Col xs={12} lg={8}>
              <Typography.Text type="secondary">{t('settings.usage.cost.estimated')}</Typography.Text>
              <div style={{ fontSize: 20, fontWeight: 600 }} data-testid="usage-hero-cost">
                {costLabel}
              </div>
            </Col>
            <Col xs={12} lg={8}>
              <Typography.Text type="secondary">{t('settings.usage.cost.unpricedTokens')}</Typography.Text>
              <div style={{ fontSize: 20, fontWeight: 600 }} data-testid="usage-hero-unpriced-tokens">
                {data.unpricedTotalTokens.toLocaleString()}
              </div>
              <Typography.Text type="secondary">
                {t('settings.usage.cost.unpricedModels')}: {data.unpricedModels}
              </Typography.Text>
            </Col>
          </Row>
          {data.efficiency ? (
            <Card size="small" title={t('settings.usage.efficiency.title')} style={{ marginTop: 12 }}>
              <Row gutter={[16, 8]}>
                {block(
                  'usage-hero-average-speed',
                  t('settings.usage.efficiency.avgSpeed'),
                  data.efficiency.avg_speed_tps === null
                    ? '-'
                    : `${data.efficiency.avg_speed_tps.toFixed(1)} tok/s`,
                  undefined,
                  6,
                )}
                {block(
                  'usage-hero-average-ttft',
                  t('settings.usage.efficiency.avgTtft'),
                  data.efficiency.avg_ttft_ms === null ? '-' : `${data.efficiency.avg_ttft_ms} ms`,
                  undefined,
                  6,
                )}
                {block(
                  'usage-hero-cache-hit-rate',
                  t('settings.usage.efficiency.cacheHitRate'),
                  data.efficiency.overall_cache_hit_rate === null
                    ? '-'
                    : `${data.efficiency.overall_cache_hit_rate.toFixed(1)}%`,
                  undefined,
                  6,
                )}
                {block(
                  'usage-hero-cache-savings',
                  t('settings.usage.efficiency.savedCost'),
                  data.efficiency.total_saved_cost === null
                    ? data.efficiency.currency === 'MIXED'
                      ? t('settings.usage.efficiency.mixedCurrency')
                      : data.efficiency.currency === 'UNAVAILABLE'
                        ? t('settings.usage.efficiency.costUnavailable')
                        : '-'
                    : data.efficiency.currency === 'N/A'
                      ? t('settings.usage.efficiency.noCache')
                      : formatCost(data.efficiency.total_saved_cost, data.efficiency.currency),
                  undefined,
                  6,
                )}
              </Row>
            </Card>
          ) : null}
        </>
      ) : (
        <Empty description={t('settings.usage.stats.empty')} data-testid="usage-hero-empty" />
      )}
    </Card>
  );
}
