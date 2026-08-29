import { lazy, Suspense } from 'react';
import type { EChartsReactProps } from 'echarts-for-react';
import { useLanguage } from '../i18n/LanguageContext';

const EChart = lazy(() => import('echarts-for-react'));

export default function LazyEChart(props: EChartsReactProps) {
  const { t } = useLanguage();
  return (
    <Suspense fallback={<div className="chart-loading" role="status">{t('chart.loading')}</div>}>
      <EChart {...props} />
    </Suspense>
  );
}
