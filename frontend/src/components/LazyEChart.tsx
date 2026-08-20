import { lazy, Suspense } from 'react';
import type { EChartsReactProps } from 'echarts-for-react';

const EChart = lazy(() => import('echarts-for-react'));

export default function LazyEChart(props: EChartsReactProps) {
  return (
    <Suspense fallback={<div className="chart-loading" role="status">图表加载中…</div>}>
      <EChart {...props} />
    </Suspense>
  );
}
