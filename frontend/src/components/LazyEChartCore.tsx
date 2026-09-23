import type { EChartsReactProps } from 'echarts-for-react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import configuredEcharts from '../charts/echartsSetup';

export default function LazyEChartCore(props: EChartsReactProps) {
  return <ReactEChartsCore {...props} echarts={configuredEcharts} />;
}
