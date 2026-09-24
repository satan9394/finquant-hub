import { useEffect, useMemo, useState } from 'react';
import { Alert, Card, Empty, Space, Spin, Statistic, Typography } from 'antd';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import type { EChartsOption } from 'echarts';
import LazyEChart from '../LazyEChart';
import apiClient from '../../services/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { readChartTokens } from '../../styles/themeTokens';

echarts.use([LineChart, GridComponent, TooltipComponent]);

interface LadderRow {
  height: number;
  count: number;
  previous_count: number | null;
  promoted_count: number | null;
  promotion_rate: number | null;
}

interface SentimentResponse {
  status: string;
  source: string;
  date: string;
  highest_board: number | null;
  total_limit_up: number | null;
  promotion_rate: number | null;
  break_rate: number | null;
  break_rate_note: string;
  sentiment_index: number | null;
  sentiment_index_basis: string | null;
  items: LadderRow[];
}

let sentimentRequest: Promise<SentimentResponse> | null = null;

function loadSentiment() {
  if (!sentimentRequest) {
    const pending = apiClient.get<SentimentResponse>('/market/sentiment-ladder').then((response) => response.data);
    sentimentRequest = pending;
    void pending.then(
      () => { if (sentimentRequest === pending) sentimentRequest = null; },
      () => { if (sentimentRequest === pending) sentimentRequest = null; },
    );
  }
  return sentimentRequest;
}

export default function SentimentLadderChart() {
  const { lang } = useLanguage();
  const zh = lang === 'zh';
  const [data, setData] = useState<SentimentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    loadSentiment()
      .then((response) => { if (mounted) setData(response); })
      .catch((reason: unknown) => {
        if (mounted) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const option = useMemo<EChartsOption>(() => {
    const tokens = readChartTokens();
    const rows = data?.items ?? [];
    return {
      backgroundColor: tokens.background,
      tooltip: {
        trigger: 'axis', backgroundColor: tokens.surface, borderColor: tokens.grid,
        textStyle: { color: tokens.textPrimary },
      },
      legend: { data: [zh ? '涨停家数' : 'Limit-ups', zh ? '昨日晋级率' : 'Promotion rate'], textStyle: { color: tokens.text } },
      grid: { left: 48, right: 48, top: 44, bottom: 36 },
      xAxis: { type: 'category', data: rows.map((row) => `${row.height}${zh ? '板' : ' boards'}`), axisLabel: { color: tokens.text } },
      yAxis: [
        { type: 'value', name: zh ? '家数' : 'Stocks', axisLabel: { color: tokens.text }, nameTextStyle: { color: tokens.text }, splitLine: { lineStyle: { color: tokens.grid } } },
        { type: 'value', name: zh ? '晋级率 %' : 'Promotion %', min: 0, max: 100, axisLabel: { color: tokens.text }, nameTextStyle: { color: tokens.text } },
      ],
      series: [
        { name: zh ? '涨停家数' : 'Limit-ups', type: 'bar', data: rows.map((row) => row.count), itemStyle: { color: tokens.primary } },
        {
          name: zh ? '昨日晋级率' : 'Promotion rate', type: 'line', yAxisIndex: 1,
          data: rows.map((row) => row.promotion_rate == null ? null : row.promotion_rate * 100),
          connectNulls: false, itemStyle: { color: tokens.up },
        },
      ],
    };
  }, [data, lang, zh]);

  return <Card className="surface-card" title={zh ? '连板情绪天梯' : 'Limit-up sentiment ladder'}>
    {loading ? <Spin /> : error ? <Alert showIcon type="error" message={zh ? '情绪数据暂不可用' : 'Sentiment data unavailable'} description={error} /> : null}
    {!loading && !error && data?.status === 'unavailable'
      ? <Empty description={zh ? '暂无可核验的涨停池快照' : 'No verifiable limit-up snapshot'} /> : null}
    {!loading && !error && data && data.status !== 'unavailable' ? <>
      <Space wrap>
        <Statistic title={zh ? '最高连板' : 'Highest board'} value={data.highest_board ?? '—'} suffix={data.highest_board == null ? '' : zh ? '板' : ''} />
        <Statistic title={zh ? '涨停家数' : 'Limit-ups'} value={data.total_limit_up ?? '—'} />
        <Statistic title={zh ? '整体晋级率' : 'Promotion rate'} value={data.promotion_rate == null ? 'UNKNOWN' : `${(data.promotion_rate * 100).toFixed(1)}%`} />
        <Statistic title={zh ? '情绪指数' : 'Sentiment index'} value={data.sentiment_index ?? 'UNKNOWN'} suffix={data.sentiment_index == null ? '' : '/100'} />
      </Space>
      {data.items.length ? <LazyEChart option={option} style={{ height: 330, width: '100%' }} notMerge lazyUpdate /> : null}
      <Alert showIcon type="warning" message={zh ? '炸板率：未知' : 'Failed limit-up rate: unknown'} description={data.break_rate_note} />
      <Typography.Text type="secondary">{zh ? `数据源：${data.source} · 交易日：${data.date}` : `Source: ${data.source} · Trading date: ${data.date}`}</Typography.Text>
      <Typography.Paragraph type="secondary">{data.sentiment_index_basis ?? (zh ? '缺少前一交易日有效快照，暂不计算情绪指数。' : 'The prior trading-day snapshot is unavailable; the composite index is not calculated.')}</Typography.Paragraph>
    </> : null}
  </Card>;
}
