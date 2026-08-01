import { useMemo } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import ReactECharts from 'echarts-for-react';
import chinaGeoJson from '@datapool/china.geojson';

echarts.registerMap('finquant-china', chinaGeoJson as Parameters<typeof echarts.registerMap>[1]);

export interface ProvinceValue { name: string; value: number }

export default function ChinaMap({ data, title = '自选股交易所所在地分布' }: { data: ProvinceValue[]; title?: string }) {
  const option = useMemo<EChartsOption>(() => ({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', formatter: '{b}<br/>{c} 个标的' },
    visualMap: {
      min: 0, max: Math.max(1, ...data.map((item) => item.value)), left: 8, bottom: 6,
      text: ['多', '少'], textStyle: { color: '#91b9ce' },
      inRange: { color: ['#153b55', '#147d9c', '#51d4ec'] }, calculable: false,
    },
    series: [{
      name: title, type: 'map', map: 'finquant-china', roam: true, scaleLimit: { min: 1, max: 4 },
      label: { show: false }, itemStyle: { areaColor: '#12354d', borderColor: '#54a8c5', borderWidth: 0.8 },
      emphasis: { label: { show: true, color: '#fff' }, itemStyle: { areaColor: '#1aa6c5' } }, data,
    }],
  }), [data, title]);

  return (
    <div className="china-map" aria-label={title}>
      <ReactECharts option={option} style={{ height: 330 }} opts={{ renderer: 'canvas' }} notMerge />
      {data.length === 0 && <span className="china-map__empty">添加 A 股或港股自选标的后显示真实分布</span>}
    </div>
  );
}
