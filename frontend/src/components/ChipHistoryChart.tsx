import { Empty } from 'antd';
import { useEffect, useMemo, useRef } from 'react';

import { useLightweightCharts } from '../hooks/useLightweightCharts';
import { useLanguage } from '../i18n/LanguageContext';
import type { AreaChartData } from '../types';
import type { ChipDistributionItem } from '../types/research';
import { chipToAreaData, type ChipSeriesField } from '../utils/chipChart';

interface ChipHistoryChartProps {
  items: ChipDistributionItem[];
  field: ChipSeriesField;
  height?: number;
}

function ChipHistoryChartCanvas({ data, height }: { data: AreaChartData[]; height: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { switchToArea } = useLightweightCharts(
    { theme: 'light', autoSize: true, height },
    containerRef,
  );

  useEffect(() => {
    switchToArea(data);
  }, [data, switchToArea]);

  return <div ref={containerRef} data-testid="chip-history-chart" style={{ width: '100%', height }} />;
}

export default function ChipHistoryChart({ items, field, height = 260 }: ChipHistoryChartProps) {
  const { t } = useLanguage();
  const data = useMemo(() => {
    const mapped = chipToAreaData(items, field);
    // ponytail: the shared hook has no formatter option; only display data uses percent units.
    return field === 'profit_ratio' ? mapped.map((point) => ({ ...point, value: point.value * 100 })) : mapped;
  }, [items, field]);

  if (data.length === 0) return <Empty description={t('research.chips.chartEmpty')} />;

  const label = t(field === 'profit_ratio' ? 'research.chips.series.profitRatio' : 'research.chips.series.averageCost');
  const unit = field === 'profit_ratio' ? '%' : ' CNY';
  const last = data[data.length - 1];

  return (
    <figure style={{ margin: 0 }}>
      <figcaption>{label} ({unit.trim()}) · {last.time}: {last.value.toFixed(2)}{unit}</figcaption>
      <ChipHistoryChartCanvas data={data} height={height} />
    </figure>
  );
}
