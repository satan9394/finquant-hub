import { Empty } from 'antd';
import { useEffect, useMemo, useRef } from 'react';

import { useLightweightCharts } from '../../hooks/useLightweightCharts';
import { useLanguage } from '../../i18n/LanguageContext';
import type { AreaChartData } from '../../types';
import { usageToAreaData, type UsageDayItem } from '../../utils/usageChart';

interface UsageTrendChartProps {
  items: UsageDayItem[];
  height?: number;
}

function UsageTrendChartCanvas({ data, height }: { data: AreaChartData[]; height: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { switchToArea } = useLightweightCharts(
    { theme: 'light', autoSize: true, height },
    containerRef,
  );

  useEffect(() => {
    switchToArea(data);
  }, [data, switchToArea]);

  return <div ref={containerRef} data-testid="usage-trend-chart" style={{ width: '100%', height }} />;
}

export default function UsageTrendChart({ items, height = 260 }: UsageTrendChartProps) {
  const { t } = useLanguage();
  const data = useMemo(() => usageToAreaData(items), [items]);

  if (data.length === 0) return <Empty description={t('settings.usage.trendEmpty')} />;

  const last = data[data.length - 1];

  return (
    <figure style={{ margin: 0 }}>
      <figcaption>
        {t('settings.usage.trendCaption')} · {last.time}: {last.value.toLocaleString()}
      </figcaption>
      <UsageTrendChartCanvas data={data} height={height} />
    </figure>
  );
}