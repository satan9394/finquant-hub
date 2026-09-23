import { Button, Empty, Space, Tabs, Typography } from 'antd';
import type { NavigateFunction } from 'react-router-dom';
import type { PortfolioAllocation, PortfolioHolding, PortfolioSummary } from '../types';
import MetricStrip from './MetricStrip';
import PortfolioEvents from './PortfolioEvents';
import PortfolioWhy from './PortfolioWhy';
import { useLanguage } from '../i18n/LanguageContext';

const money = (value: number | null | undefined) => value == null ? 'UNKNOWN' : `¥${value.toFixed(2)}`;

export default function PortfolioOverview({ summary, allocation, holdings, navigate }: {
  summary: PortfolioSummary | null;
  allocation: PortfolioAllocation[];
  holdings: PortfolioHolding[];
  navigate: NavigateFunction;
}) {
  const { t } = useLanguage();
  const largestGroup = [...allocation].sort((left, right) => right.weight - left.weight)[0];
  const largestHolding = [...holdings].filter((item) => item.weight != null).sort((left, right) => (right.weight ?? 0) - (left.weight ?? 0))[0];

  return <section className="portfolio-decision-space" aria-label={t('portfolio.workspaceAria')}>
    <MetricStrip items={[
      { key: 'market-value', label: t('portfolio.marketValue'), value: money(summary?.total_current) },
      { key: 'today-pnl', label: t('portfolio.todayPnl'), value: 'UNKNOWN' },
      { key: 'total-pnl', label: t('portfolio.cumulativePnl'), value: summary ? money(summary.total_profit) : 'UNKNOWN', tone: (summary?.total_profit ?? 0) >= 0 ? 'up' : 'down' },
      { key: 'return', label: t('portfolio.cumulativeReturn'), value: summary ? `${summary.total_profit_percent >= 0 ? '+' : ''}${summary.total_profit_percent.toFixed(2)}%` : 'UNKNOWN' },
    ]} />
    <Tabs
      defaultActiveKey="overview"
      items={[
        {
          key: 'overview', label: t('portfolio.tab.overview'), children: <>
            <Typography.Paragraph type="secondary">
              {t('portfolio.overviewEvidence')}
            </Typography.Paragraph>
            <Typography.Title level={5}>{t('portfolio.why')}</Typography.Title>
            <PortfolioWhy summary={summary} />
          </>,
        },
        {
          key: 'holdings', label: t('portfolio.tab.holdings'), children: holdings.length ? <Space wrap>
            {holdings.map((holding) => <Typography.Text key={holding.id}>{holding.name} · {holding.weight == null ? 'UNKNOWN' : `${(holding.weight * 100).toFixed(1)}%`}</Typography.Text>)}
          </Space> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('portfolio.noHoldings')} />,
        },
        {
          key: 'performance', label: t('portfolio.tab.performance'), children: <Typography.Paragraph>{t('portfolio.performanceSummary', { return: summary ? `${summary.total_profit_percent >= 0 ? '+' : ''}${summary.total_profit_percent.toFixed(2)}%` : 'UNKNOWN' })}</Typography.Paragraph>,
        },
        {
          key: 'exposure', label: t('portfolio.tab.exposure'), children: allocation.length ? <Space direction="vertical">
            {allocation.map((item) => <Typography.Text key={item.group_id}>{item.group_name} · {(item.weight * 100).toFixed(1)}%</Typography.Text>)}
          </Space> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('portfolio.noAllocation')} />,
        },
        {
          key: 'risk', label: t('portfolio.tab.risk'), children: <Space direction="vertical">
            <Typography.Text>{t('portfolio.largestGroup')}：{largestGroup ? `${largestGroup.group_name} · ${(largestGroup.weight * 100).toFixed(1)}%` : 'UNKNOWN'}</Typography.Text>
            <Typography.Text>{t('portfolio.largestHolding')}：{largestHolding ? `${largestHolding.name} · ${((largestHolding.weight ?? 0) * 100).toFixed(1)}%` : 'UNKNOWN'}</Typography.Text>
            <Typography.Text type="secondary">{t('portfolio.advancedRiskUnknown')}</Typography.Text>
          </Space>,
        },
        { key: 'events', label: t('portfolio.tab.events'), children: <PortfolioEvents /> },
        {
          key: 'scenario', label: t('portfolio.tab.scenario'), children: <Typography.Paragraph type="secondary">{t('portfolio.scenarioUnknown')}</Typography.Paragraph>,
        },
        {
          key: 'research', label: t('portfolio.tab.research'), children: holdings.length ? <Space wrap>
            {holdings.slice(0, 8).flatMap((holding) => [
              <Button key={`${holding.id}-research`} onClick={() => navigate(`/research/${encodeURIComponent(holding.code)}`)}>{t('portfolio.researchAction', { name: holding.name })}</Button>,
              <Button key={`${holding.id}-thesis`} onClick={() => navigate(`/research?mode=thesis&new=1&ticker=${encodeURIComponent(holding.code)}`)}>{t('portfolio.thesisAction')}</Button>,
              <Button key={`${holding.id}-monitor`} onClick={() => navigate(`/alerts?new=1&ticker=${encodeURIComponent(holding.code)}`)}>{t('portfolio.monitorAction')}</Button>,
            ])}
          </Space> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('portfolio.noResearch')} />,
        },
      ]}
    />
  </section>;
}
