import { useMemo } from 'react';

import LazyEChart from '../LazyEChart';
import { readChartTokens } from '../../styles/themeTokens';

export type IcPoint = { date: string; ic: number; rank_ic: number };

export default function FactorIcHistogram({ data, themeVersion = 0 }: { data: IcPoint[]; themeVersion?: number }) {
  const option = useMemo(() => {
    const tokens = readChartTokens();
    return {
      animation: false,
      grid: { left: 52, right: 20, top: 32, bottom: 48, containLabel: true },
      legend: { top: 0, textStyle: { color: tokens.text } },
      tooltip: { trigger: 'axis', valueFormatter: (value: number) => Number(value).toFixed(4) },
      dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 4 }],
      xAxis: {
        type: 'category', data: data.map((point) => point.date),
        axisLabel: { color: tokens.text, hideOverlap: true },
        axisLine: { lineStyle: { color: tokens.grid } },
      },
      yAxis: {
        type: 'value', min: -1, max: 1,
        axisLabel: { color: tokens.text },
        splitLine: { lineStyle: { color: tokens.grid } },
      },
      series: [
        {
          name: 'IC', type: 'bar', barMaxWidth: 14,
          data: data.map((point) => ({ value: point.ic, itemStyle: { color: point.ic >= 0 ? tokens.up : tokens.down } })),
        },
        { name: 'Rank IC', type: 'line', showSymbol: false, data: data.map((point) => point.rank_ic), itemStyle: { color: tokens.primary } },
      ],
    };
  }, [data, themeVersion]);

  return (
    <div role="img" aria-label="按日期排列的 IC 柱状图与 Rank IC 折线图">
      <p className="chart-text-summary">每期按横截面因子值与下一期收益计算；正值表示同向排序关系。</p>
      <LazyEChart option={option} style={{ height: 300, width: '100%' }} notMerge />
    </div>
  );
}
