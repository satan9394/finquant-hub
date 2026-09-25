import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Card, Empty, Spin, Typography } from 'antd';
import * as echarts from 'echarts/core';
import { GraphChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import type { EChartsOption } from 'echarts';
import LazyEChart from '../LazyEChart';
import apiClient from '../../services/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { readChartTokens } from '../../styles/themeTokens';

echarts.use([GraphChart, TooltipComponent]);

interface SeatNode {
  id: string;
  name: string;
  category: 'institution' | 'brokerage';
  buy_amount_cny_10k: number;
  security_count: number;
}

interface SeatEdge {
  source: string;
  target: string;
  shared_buy_amount_cny_10k: number;
  common_security_days: number;
}

interface SeatGraphResponse {
  status: string;
  note: string;
  source: string;
  date_from: string;
  date_to: string;
  nodes: SeatNode[];
  edges: SeatEdge[];
}

let seatGraphRequest: Promise<SeatGraphResponse> | null = null;

function loadSeatGraph() {
  if (!seatGraphRequest) {
    const pending = apiClient.get<SeatGraphResponse>('/market/dragon-tiger-network', { params: { days: 5 } })
      .then((response) => response.data);
    seatGraphRequest = pending;
    void pending.then(
      () => { if (seatGraphRequest === pending) seatGraphRequest = null; },
      () => { if (seatGraphRequest === pending) seatGraphRequest = null; },
    );
  }
  return seatGraphRequest;
}

export default function DragonTigerSeatGraph() {
  const { lang } = useLanguage();
  const zh = lang === 'zh';
  const chartHostRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<SeatGraphResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartVisible, setChartVisible] = useState(false);

  useEffect(() => {
    const host = chartHostRef.current;
    if (!host) return;
    const updateVisibility = () => {
      if (typeof ResizeObserver === 'undefined') {
        setChartVisible(true);
        return;
      }
      const bounds = host.getBoundingClientRect();
      const visible = bounds.width > 0 && bounds.height > 0;
      setChartVisible((current) => current === visible ? current : visible);
    };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateVisibility) : null;
    if (observer) {
      observer.observe(host);
    }
    const tabPane = host.closest('.ant-tabs-tabpane');
    const mutationObserver = new MutationObserver(updateVisibility);
    if (tabPane) mutationObserver.observe(tabPane, { attributes: true, attributeFilter: ['class', 'style'] });
    updateVisibility();
    return () => {
      observer?.disconnect();
      mutationObserver.disconnect();
    };
  }, [data?.nodes.length]);

  useEffect(() => {
    let mounted = true;
    loadSeatGraph()
      .then((response) => { if (mounted) setData(response); })
      .catch((reason: unknown) => {
        if (mounted) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const option = useMemo<EChartsOption>(() => {
    const tokens = readChartTokens();
    const maxBuy = Math.max(1, ...(data?.nodes ?? []).map((node) => node.buy_amount_cny_10k));
    return {
      backgroundColor: tokens.background,
      tooltip: {
        trigger: 'item', backgroundColor: tokens.surface, borderColor: tokens.grid,
        textStyle: { color: tokens.textPrimary },
      },
      legend: { textStyle: { color: tokens.text } },
      series: [{
        type: 'graph',
        layout: 'circular',
        circular: { rotateLabel: true },
        roam: true,
        categories: [
          { name: zh ? '机构席位' : 'Institutions', itemStyle: { color: tokens.secondary } },
          { name: zh ? '证券营业部' : 'Brokerages', itemStyle: { color: tokens.primary } },
        ],
        data: (data?.nodes ?? []).map((node) => ({
          ...node,
          category: node.category === 'institution' ? 0 : 1,
          value: node.buy_amount_cny_10k,
          symbolSize: 18 + 28 * Math.sqrt(node.buy_amount_cny_10k / maxBuy),
          itemStyle: { color: node.category === 'institution' ? tokens.secondary : tokens.primary },
          label: { show: true, color: tokens.textPrimary },
        })) as never,
        edges: (data?.edges ?? []).map((edge) => ({
          ...edge,
          value: edge.shared_buy_amount_cny_10k,
          lineStyle: {
            width: Math.min(8, 1 + Math.sqrt(edge.shared_buy_amount_cny_10k)),
            color: tokens.gridStrong,
            opacity: 0.8,
          },
        })) as never,
        lineStyle: { color: tokens.gridStrong, opacity: 0.7 },
        emphasis: { focus: 'adjacency' },
      }],
    };
  }, [data, zh]);

  return <Card className="surface-card" title={zh ? '龙虎榜席位共现网络' : 'Dragon Tiger seat co-occurrence'}>
    {loading ? <Spin /> : error ? <Alert showIcon type="error" message={zh ? '席位网络暂不可用' : 'Seat network unavailable'} description={error} /> : null}
    {!loading && !error && !data?.nodes.length
      ? <Empty description={zh ? '所选窗口内没有龙虎榜席位记录' : 'No Dragon Tiger seat records in this window'} /> : null}
    {!loading && !error && !!data?.nodes.length ? <>
      <div ref={chartHostRef} style={{ height: 420, width: '100%' }}>
        {chartVisible && <LazyEChart option={option} style={{ height: '100%', width: '100%' }} notMerge lazyUpdate />}
      </div>
      <Typography.Text type="secondary">
        {zh ? `数据源：${data.source} · 窗口：${data.date_from} 至 ${data.date_to}` : `Source: ${data.source} · Window: ${data.date_from} to ${data.date_to}`}
      </Typography.Text>
      <Typography.Paragraph type="secondary">{data.note}</Typography.Paragraph>
    </> : null}
  </Card>;
}
