import { useEffect, useMemo, useState } from 'react';
import { Alert, Card, Empty, Spin, Typography } from 'antd';
import * as echarts from 'echarts/core';
import { TreemapChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import type { EChartsOption } from 'echarts';
import LazyEChart from '../LazyEChart';
import apiClient from '../../services/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { readChartTokens } from '../../styles/themeTokens';

echarts.use([TreemapChart, TooltipComponent]);

export interface MarketTreemapNode {
  name: string;
  code?: string | null;
  value: number;
  change_percent?: number | null;
  kind?: string;
  coverage?: string;
  children?: MarketTreemapNode[];
}

interface MarketTreemapResponse {
  as_of: string;
  source: string;
  classification: string;
  classification_note: string;
  quality: string;
  status: string;
  items: MarketTreemapNode[];
}

let treemapRequest: Promise<MarketTreemapResponse> | null = null;

function loadTreemap() {
  if (!treemapRequest) {
    const pending = apiClient.get<MarketTreemapResponse>('/market/sector-treemap').then((response) => response.data);
    treemapRequest = pending;
    void pending.then(
      () => { if (treemapRequest === pending) treemapRequest = null; },
      () => { if (treemapRequest === pending) treemapRequest = null; },
    );
  }
  return treemapRequest;
}

function colorize(node: MarketTreemapNode, tokens: ReturnType<typeof readChartTokens>): Record<string, unknown> {
  const color = node.change_percent == null
    ? tokens.unknown
    : node.change_percent > 0 ? tokens.up : node.change_percent < 0 ? tokens.down : tokens.warning;
  return {
    ...node,
    itemStyle: { color },
    ...(node.children ? { children: node.children.map((child) => colorize(child, tokens)) } : {}),
  };
}

export default function MarketTreemapChart() {
  const { lang } = useLanguage();
  const zh = lang === 'zh';
  const [data, setData] = useState<MarketTreemapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    loadTreemap()
      .then((response) => { if (mounted) setData(response); })
      .catch((reason: unknown) => {
        if (mounted) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const option = useMemo<EChartsOption>(() => {
    const tokens = readChartTokens();
    return {
      backgroundColor: tokens.background,
      tooltip: {
        trigger: 'item', formatter: '{b}<br/>{c} CNY',
        backgroundColor: tokens.surface, borderColor: tokens.grid, textStyle: { color: tokens.textPrimary },
      },
      series: [{
        type: 'treemap',
        roam: false,
        nodeClick: 'zoomToNode',
        breadcrumb: { show: true },
        label: { show: true, overflow: 'truncate', color: tokens.textPrimary },
        upperLabel: { show: true, height: 24, color: tokens.textPrimary },
        data: (data?.items ?? []).map((node) => colorize(node, tokens)) as never,
      }],
    };
  }, [data]);

  return <Card className="surface-card" title={zh ? '行业成交额热力树图' : 'Industry turnover treemap'}>
    {loading ? <Spin /> : error ? <Alert showIcon type="error" message={zh ? '行业树图暂不可用' : 'Industry treemap unavailable'} description={error} /> : null}
    {!loading && !error && (data?.quality !== 'DIRECT' || !data.items.length)
      ? <Empty description={zh ? '当前没有可核验的行业数据' : 'No verifiable industry data'} /> : null}
    {!loading && !error && data?.quality === 'DIRECT' && data.items.length ? <>
      <Typography.Paragraph type="secondary">
        {zh
          ? `${data.classification_note} 数据源：${data.source} · 更新：${data.as_of}`
          : `Eastmoney industry classification; verified Shenwan Level 1 membership is unavailable. Source: ${data.source} · Updated: ${data.as_of}`}
      </Typography.Paragraph>
      <LazyEChart option={option} style={{ height: 420, width: '100%' }} notMerge lazyUpdate />
      <Typography.Text type="secondary">
        {zh ? '面积为成交金额；前四个行业含代表成分股，其余行业按行业汇总展示。' : 'Area is turnover. Representative constituents are shown for the top four sectors; other sectors use direct board totals.'}
      </Typography.Text>
    </> : null}
  </Card>;
}
