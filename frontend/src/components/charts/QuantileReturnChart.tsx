import { useMemo } from 'react';

import LazyEChart from '../LazyEChart';
import { readChartTokens } from '../../styles/themeTokens';

export type QuantileReturns = {
  dates: string[];
  q1: number[];
  q2: number[];
  q3: number[];
  q4: number[];
  q5: number[];
  long_short: number[];
};

export default function QuantileReturnChart({ data, themeVersion = 0 }: { data: QuantileReturns; themeVersion?: number }) {
  const option = useMemo(() => {
    const tokens = readChartTokens();
    return {
      animation: false,
      color: [tokens.unknown, tokens.secondary, tokens.model, tokens.primary, tokens.up, tokens.risk],
      grid: { left: 48, right: 20, top: 36, bottom: 48, containLabel: true },
      legend: { top: 0, textStyle: { color: tokens.text } },
      tooltip: { trigger: 'axis', valueFormatter: (value: number) => Number(value).toFixed(4) },
      dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 4 }],
      xAxis: {
        type: 'category', data: data.dates, boundaryGap: false,
        axisLabel: { color: tokens.text, hideOverlap: true },
        axisLine: { lineStyle: { color: tokens.grid } },
      },
      yAxis: {
        type: 'value', scale: true,
        axisLabel: { color: tokens.text },
        splitLine: { lineStyle: { color: tokens.grid } },
      },
      series: [
        ...(['q1', 'q2', 'q3', 'q4', 'q5'] as const).map((key, index) => ({
          name: `Q${index + 1}`, type: 'line', showSymbol: false, connectNulls: false, data: data[key],
        })),
        { name: 'Q5 − Q1', type: 'line', showSymbol: false, lineStyle: { type: 'dashed' }, data: data.long_short },
      ],
    };
  }, [data, themeVersion]);

  return (
    <div role="img" aria-label="五分位累计收益与 Q5 减 Q1 净值差">
      <p className="chart-text-summary">组合从净值 1.0 起算；Q5 − Q1 为两条累计净值之差。</p>
      <LazyEChart option={option} style={{ height: 340, width: '100%' }} notMerge />
    </div>
  );
}
