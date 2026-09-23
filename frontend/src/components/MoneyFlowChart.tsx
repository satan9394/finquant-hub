import { Empty } from 'antd';
import { useEffect, useMemo, useRef } from 'react';

import { useLightweightCharts } from '../hooks/useLightweightCharts';
import { useLanguage } from '../i18n/LanguageContext';
import type { AreaChartData } from '../types';
import type { MoneyFlowItem } from '../types/research';
import { moneyFlowToAreaData, type MoneyFlowPeriod } from '../utils/moneyFlowChart';

interface MoneyFlowChartProps {
  items: MoneyFlowItem[];
  period: MoneyFlowPeriod;
  height?: number;
}

function MoneyFlowChartCanvas({ data, height }: { data: AreaChartData[]; height: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { switchToArea } = useLightweightCharts(
    { theme: 'light', autoSize: true, height },
    containerRef,
  );

  useEffect(() => {
    switchToArea(data);
  }, [data, switchToArea]);

  return <div ref={containerRef} data-testid="money-flow-chart" style={{ width: '100%', height }} />;
}

export default function MoneyFlowChart({ items, period, height = 260 }: MoneyFlowChartProps) {
  const { t } = useLanguage();
  const data = useMemo(() => moneyFlowToAreaData(items, period), [items, period]);

  if (data.length === 0) return <Empty description={t('research.moneyFlow.chartEmpty')} />;

  return <MoneyFlowChartCanvas data={data} height={height} />;
}
