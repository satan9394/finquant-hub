import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Drawer, Empty, Segmented, Space, Spin, Tag, Typography } from 'antd';
import {
  type HistogramData,
  type ISeriesApi,
  type LineData,
  type MouseEventParams,
  type SeriesMarker,
  type SeriesType,
  type Time,
} from 'lightweight-charts';

import { useProChart, chartTimeKey } from '../../hooks/useProChart';
import apiClient from '../../services/api';
import type { ResearchReportDetail } from '../../types/research';
import { useLanguage } from '../../i18n/LanguageContext';
import { reportCoreText, sameTicker } from '../../features/researchContinuity';
import {
  calculateBOLL,
  calculateEMA,
  calculateKDJ,
  calculateMA,
  calculateMACD,
  calculateRSI,
  type OHLCVPoint,
} from './chartIndicators';
import { readChartTokens } from '../../styles/themeTokens';

const { Text, Paragraph } = Typography;

export type ChartPeriod = 'day' | 'week' | 'month' | '60m' | '30m' | '15m' | '5m';
type Indicator = 'MACD' | 'KDJ' | 'RSI';
type OverlayIndicator = 'MA' | 'EMA' | 'BOLL';
type Verdict = 'buy' | 'neutral' | 'avoid' | 'unknown';

interface KlineItem extends Omit<OHLCVPoint, 'time'> {
  day: string;
  time?: number;
  source?: string;
  adjustment?: string;
}

export interface ResearchMarker {
  report: ResearchReportDetail;
  marker: SeriesMarker<Time>;
  verdict: Verdict;
}

const periodOptions: Record<'zh' | 'en', Array<{ label: string; value: ChartPeriod }>> = {
  zh: [
    { label: '日 K', value: 'day' }, { label: '周 K', value: 'week' }, { label: '月 K', value: 'month' },
    { label: '60 分钟', value: '60m' }, { label: '30 分钟', value: '30m' },
    { label: '15 分钟', value: '15m' }, { label: '5 分钟', value: '5m' },
  ],
  en: [
    { label: 'Day', value: 'day' }, { label: 'Week', value: 'week' }, { label: 'Month', value: 'month' },
    { label: '60 min', value: '60m' }, { label: '30 min', value: '30m' },
    { label: '15 min', value: '15m' }, { label: '5 min', value: '5m' },
  ],
};

function datePart(value: string): string {
  return value.slice(0, 10);
}

function bucketDate(value: string, period: ChartPeriod): string {
  const day = datePart(value);
  if (period === 'month') return `${day.slice(0, 7)}-01`;
  if (period !== 'week') return day;
  const date = new Date(`${day}T00:00:00Z`);
  const weekdayFromMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekdayFromMonday);
  return date.toISOString().slice(0, 10);
}

export function readReportVerdict(report: ResearchReportDetail): Verdict {
  const raw = report.report_data.verdict;
  if (typeof raw !== 'string') return 'unknown';
  const verdict = raw.trim().toLowerCase();
  if (['buy', 'strong_buy', 'bullish', 'long', '看多', '买入', '買入', '增持'].includes(verdict)) return 'buy';
  if (['neutral', 'hold', 'cautious', '审慎', '中性', '观望'].includes(verdict)) return 'neutral';
  if (['avoid', 'sell', 'bearish', 'short', '看空', '规避', '卖出', '减持'].includes(verdict)) return 'avoid';
  return 'unknown';
}

export function buildResearchMarkers(
  rows: readonly KlineItem[],
  reports: readonly ResearchReportDetail[],
  symbol: string,
  period: ChartPeriod,
  lang: 'zh' | 'en',
): ResearchMarker[] {
  const pointsByBucket = new Map<string, KlineItem>();
  for (const row of rows) pointsByBucket.set(bucketDate(row.day, period), row);
  const tokens = readChartTokens();
  const labels: Record<Verdict, string> = lang === 'zh'
    ? { buy: '买', neutral: '中', avoid: '避', unknown: '未知' }
    : { buy: 'BUY', neutral: 'NEU', avoid: 'AVD', unknown: 'UNK' };
  const colors: Record<Verdict, string> = {
    buy: tokens.up,
    neutral: tokens.warning,
    avoid: tokens.down,
    unknown: tokens.unknown,
  };
  const positions: Record<Verdict, SeriesMarker<Time>['position']> = {
    buy: 'belowBar', neutral: 'aboveBar', avoid: 'aboveBar', unknown: 'inBar',
  };
  const shapes: Record<Verdict, SeriesMarker<Time>['shape']> = {
    buy: 'arrowUp', neutral: 'circle', avoid: 'arrowDown', unknown: 'square',
  };

  return reports.flatMap((report) => {
    if (!sameTicker(report.ticker, symbol) || !/^\d{4}-\d{2}-\d{2}/.test(report.created_at)) return [];
    const row = pointsByBucket.get(bucketDate(report.created_at, period));
    if (!row) return [];
    const verdict = readReportVerdict(report);
    return [{
      report,
      verdict,
      marker: {
        id: String(report.id),
        time: row.time === undefined ? datePart(row.day) : Math.floor(row.time) as Time,
        position: positions[verdict],
        shape: shapes[verdict],
        color: colors[verdict],
        text: labels[verdict],
        size: 1.2,
      },
    }];
  });
}

function mapLineData(points: readonly { time: Time; value: number }[]): LineData<Time>[] {
  return points.map((point) => ({ time: point.time, value: point.value }));
}

function mapHistogramData(points: readonly { time: Time; value: number }[], colors: ReturnType<typeof readChartTokens>): HistogramData<Time>[] {
  return points.map((point) => ({ time: point.time, value: point.value, color: point.value >= 0 ? colors.up : colors.down }));
}

export default function ProCandlestickChart({
  symbol,
  reports,
}: {
  symbol: string;
  reports: ResearchReportDetail[];
}) {
  const { lang } = useLanguage();
  const language = lang === 'zh' ? 'zh' : 'en';
  const copy = language === 'zh' ? {
    title: '专业 K 线与技术指标', period: 'K 线周期', mainIndicators: '主图指标', indicator: '副图指标', volume: '成交量',
    macd: 'MACD', kdj: 'KDJ', rsi: 'RSI', loading: '正在获取真实 K 线…', empty: '该周期没有可用 K 线数据',
    retry: '重试', markerTitle: '研报结论锚点', noReports: '当前标的没有可定位到图表区间的研报事件',
    report: '研究报告', unknown: '未知结论', reportTime: '报告时间', close: '关闭', summaryMissing: '报告未提供可展示的文字结论。',
    source: '数据源', asOf: '截至', adjustment: '复权', unavailable: '未知',
    open: '开', high: '高', low: '低', closeValue: '收', volumeValue: '量',
    verdict: { buy: '看多 / 买入', neutral: '审慎 / 中性', avoid: '看空 / 规避', unknown: '未知' },
  } : {
    title: 'Pro Candlestick and Indicators', period: 'Period', mainIndicators: 'Main indicators', indicator: 'Lower indicator', volume: 'Volume',
    macd: 'MACD', kdj: 'KDJ', rsi: 'RSI', loading: 'Loading market candles…', empty: 'No candles are available for this period',
    retry: 'Retry', markerTitle: 'Research report markers', noReports: 'No report events fall within the visible chart range',
    report: 'Research report', unknown: 'Unknown verdict', reportTime: 'Report time', close: 'Close', summaryMissing: 'The report has no text conclusion to display.',
    source: 'Source', asOf: 'As of', adjustment: 'Adjustment', unavailable: 'Unknown',
    open: 'Open', high: 'High', low: 'Low', closeValue: 'Close', volumeValue: 'Volume',
    verdict: { buy: 'Bullish / Buy', neutral: 'Cautious / Neutral', avoid: 'Bearish / Avoid', unknown: 'Unknown' },
  };

  const [period, setPeriod] = useState<ChartPeriod>('day');
  const [indicator, setIndicator] = useState<Indicator>('MACD');
  const [visibleOverlays, setVisibleOverlays] = useState<OverlayIndicator[]>(['MA', 'EMA', 'BOLL']);
  const [rows, setRows] = useState<KlineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [crosshairPoint, setCrosshairPoint] = useState<OHLCVPoint | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const overlaySeriesRef = useRef<Partial<Record<OverlayIndicator, ISeriesApi<SeriesType, Time>[]>>>({});
  const containers = useMemo(() => ({ main: mainRef, volume: volumeRef, indicator: indicatorRef }), []);
  const { charts, themeVersion, registerPrimarySeries, unregisterPrimarySeries } = useProChart(containers);

  useEffect(() => {
    const controller = new AbortController();
    setRows([]);
    setError(null);
    setLoading(true);
    apiClient.get<{ items: KlineItem[] }>('/market/kline', {
      params: { symbol, period, count: period === 'month' ? 120 : 300 },
      signal: controller.signal,
    }).then((response) => {
      const items = Array.isArray(response.data.items) ? response.data.items : [];
      setRows(items.map((item) => ({ ...item, time: item.time ?? undefined })));
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [symbol, period, reloadVersion]);

  const points = useMemo<OHLCVPoint[]>(() => rows.map((row) => ({
    time: row.time === undefined ? datePart(row.day) : Math.floor(row.time) as Time,
    open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume,
  })), [rows]);
  const researchMarkers = useMemo(
    () => buildResearchMarkers(rows, reports, symbol, period, language),
    [rows, reports, symbol, period, language],
  );
  const markerReports = useMemo(() => new Map(researchMarkers.map((item) => [String(item.report.id), item.report])), [researchMarkers]);
  const selectedReport = reports.find((report) => report.id === selectedReportId) ?? null;
  const pointsByTime = useMemo(
    () => new Map(points.map((point) => [chartTimeKey(point.time), point])),
    [points],
  );

  useEffect(() => {
    if (!charts) return;
    const onCrosshairMove = (event: MouseEventParams<Time>) => {
      if (event.time == null) {
        setCrosshairPoint(null);
        return;
      }
      const timeKey = chartTimeKey(event.time);
      setCrosshairPoint(pointsByTime.get(timeKey) ?? null);
    };
    charts.main.subscribeCrosshairMove(onCrosshairMove);
    return () => charts.main.unsubscribeCrosshairMove(onCrosshairMove);
  }, [charts, pointsByTime]);

  useEffect(() => {
    if (!charts || points.length === 0) return;
    const tokens = readChartTokens();
    const added: Array<{ panel: 'main' | 'volume' | 'indicator'; series: ISeriesApi<SeriesType, Time> }> = [];
    const main = charts.main.addCandlestickSeries({
      upColor: tokens.up, downColor: tokens.down, borderUpColor: tokens.up, borderDownColor: tokens.down,
      wickUpColor: tokens.up, wickDownColor: tokens.down,
      priceLineColor: tokens.primary,
    });
    added.push({ panel: 'main', series: main });
    main.setData(points.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
    const mainValues = new Map(points.map((point) => [chartTimeKey(point.time), point.close]));
    registerPrimarySeries('main', main, mainValues);

    const ma = charts.main.addLineSeries({ color: tokens.primary, lineWidth: 1, title: 'MA20' });
    const ema = charts.main.addLineSeries({ color: tokens.secondary, lineWidth: 1, title: 'EMA20' });
    const bollUpper = charts.main.addLineSeries({ color: tokens.warning, lineWidth: 1, title: 'BOLL Upper' });
    const bollMiddle = charts.main.addLineSeries({ color: tokens.model, lineWidth: 1, title: 'BOLL Middle' });
    const bollLower = charts.main.addLineSeries({ color: tokens.warning, lineWidth: 1, title: 'BOLL Lower' });
    for (const series of [ma, ema, bollUpper, bollMiddle, bollLower]) added.push({ panel: 'main', series });
    overlaySeriesRef.current = { MA: [ma], EMA: [ema], BOLL: [bollUpper, bollMiddle, bollLower] };
    ma.setData(mapLineData(calculateMA(points, 20)));
    ema.setData(mapLineData(calculateEMA(points, 20)));
    const boll = calculateBOLL(points, 20, 2);
    bollUpper.setData(mapLineData(boll.upper));
    bollMiddle.setData(mapLineData(boll.middle));
    bollLower.setData(mapLineData(boll.lower));

    const volume = charts.volume.addHistogramSeries({ color: tokens.primary, priceFormat: { type: 'volume' }, priceLineVisible: false });
    added.push({ panel: 'volume', series: volume });
    const volumeData = points.map((point, index) => ({
      time: point.time, value: point.volume, color: point.close >= point.open ? tokens.up : tokens.down,
    }));
    volume.setData(volumeData);
    registerPrimarySeries('volume', volume, new Map(volumeData.map((point) => [chartTimeKey(point.time), point.value])));

    const macd = calculateMACD(points);
    const kdj = calculateKDJ(points);
    const rsi = calculateRSI(points);
    const timeAnchor = charts.indicator.addLineSeries({
      visible: false, priceLineVisible: false, lastValueVisible: false, title: 'time-anchor',
    });
    timeAnchor.setData(points.map((point) => ({ time: point.time, value: 0 })));
    added.push({ panel: 'indicator', series: timeAnchor });
    if (indicator === 'MACD') {
      const histogram = charts.indicator.addHistogramSeries({ color: tokens.primary, priceLineVisible: false });
      const dif = charts.indicator.addLineSeries({ color: tokens.primary, lineWidth: 1, title: 'DIF' });
      const dea = charts.indicator.addLineSeries({ color: tokens.warning, lineWidth: 1, title: 'DEA' });
      added.push({ panel: 'indicator', series: histogram }, { panel: 'indicator', series: dif }, { panel: 'indicator', series: dea });
      histogram.setData(mapHistogramData(macd.macd, tokens));
      dif.setData(mapLineData(macd.dif));
      dea.setData(mapLineData(macd.dea));
      registerPrimarySeries('indicator', dif, new Map(macd.dif.map((point) => [chartTimeKey(point.time), point.value])));
    } else if (indicator === 'KDJ') {
      const k = charts.indicator.addLineSeries({ color: tokens.primary, lineWidth: 1, title: 'K' });
      const d = charts.indicator.addLineSeries({ color: tokens.warning, lineWidth: 1, title: 'D' });
      const j = charts.indicator.addLineSeries({ color: tokens.secondary, lineWidth: 1, title: 'J' });
      added.push({ panel: 'indicator', series: k }, { panel: 'indicator', series: d }, { panel: 'indicator', series: j });
      k.setData(mapLineData(kdj.k)); d.setData(mapLineData(kdj.d)); j.setData(mapLineData(kdj.j));
      registerPrimarySeries('indicator', k, new Map(kdj.k.map((point) => [chartTimeKey(point.time), point.value])));
    } else {
      const rsiSeries = charts.indicator.addLineSeries({ color: tokens.primary, lineWidth: 1, title: 'RSI14' });
      added.push({ panel: 'indicator', series: rsiSeries });
      rsiSeries.setData(mapLineData(rsi));
      registerPrimarySeries('indicator', rsiSeries, new Map(rsi.map((point) => [chartTimeKey(point.time), point.value])));
    }

    main.setMarkers(researchMarkers.map((item) => item.marker));
    const onMarkerClick = (event: { hoveredObjectId?: unknown }) => {
      if (typeof event.hoveredObjectId !== 'string') return;
      const report = markerReports.get(event.hoveredObjectId);
      if (report) setSelectedReportId(report.id);
    };
    charts.main.subscribeClick(onMarkerClick);
    charts.main.timeScale().fitContent();
    charts.volume.timeScale().fitContent();
    charts.indicator.timeScale().fitContent();

    return () => {
      charts.main.unsubscribeClick(onMarkerClick);
      overlaySeriesRef.current = {};
      for (const item of added) {
        unregisterPrimarySeries(item.panel, item.series);
        const target = item.panel === 'main' ? charts.main : item.panel === 'volume' ? charts.volume : charts.indicator;
        target.removeSeries(item.series);
      }
    };
  }, [charts, points, period, indicator, researchMarkers, markerReports, themeVersion, registerPrimarySeries, unregisterPrimarySeries]);

  useEffect(() => {
    for (const key of ['MA', 'EMA', 'BOLL'] as const) {
      for (const series of overlaySeriesRef.current[key] ?? []) {
        series.applyOptions({ visible: visibleOverlays.includes(key) });
      }
    }
  }, [visibleOverlays, charts, points, period, indicator, themeVersion]);

  const source = rows.length ? rows[rows.length - 1].source : undefined;
  const latestRow = rows[rows.length - 1];
  const selectedVerdict = selectedReport ? readReportVerdict(selectedReport) : null;

  return (
    <section aria-label={copy.title} data-testid="pro-candlestick-chart">
      <Space wrap style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
        <Space wrap>
          <Text strong>{copy.period}</Text>
          <Segmented
            aria-label={copy.period}
            disabled={loading}
            options={periodOptions[language]}
            value={period}
            onChange={(value) => setPeriod(value as ChartPeriod)}
          />
          <Text strong>{copy.mainIndicators}</Text>
          <Checkbox.Group<OverlayIndicator>
            aria-label={copy.mainIndicators}
            options={['MA', 'EMA', 'BOLL'] as OverlayIndicator[]}
            value={visibleOverlays}
            onChange={(value) => setVisibleOverlays(value)}
          />
          <Text strong>{copy.indicator}</Text>
          <Segmented<Indicator>
            aria-label={copy.indicator}
            options={[copy.macd, copy.kdj, copy.rsi] as Indicator[]}
            value={indicator}
            onChange={setIndicator}
          />
        </Space>
        {latestRow && <Tag>{copy.source}: {source ?? copy.unavailable} · {copy.asOf}: {datePart(latestRow.day)} · {copy.adjustment}: {latestRow.adjustment ?? copy.unavailable}</Tag>}
      </Space>
      {error && <Alert type="warning" showIcon message={error} action={<Button size="small" onClick={() => setReloadVersion((version) => version + 1)}>{copy.retry}</Button>} style={{ marginBottom: 12 }} />}
      {loading && <div style={{ padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Spin /><Text>{copy.loading}</Text></div>}
      {!loading && !error && rows.length === 0 && <Empty description={copy.empty} />}
      <div style={{ position: 'relative' }}>
        <div ref={mainRef} data-testid="pro-chart-main" aria-label={copy.title} style={{ height: 320, minWidth: 0 }} />
        {crosshairPoint && (
          <div
            role="status"
            data-testid="pro-chart-crosshair-tooltip"
            style={{
              position: 'absolute', top: 8, left: 8, zIndex: 2, display: 'flex', flexWrap: 'wrap', gap: 8,
              padding: '4px 8px', border: '1px solid var(--fq-border)', borderRadius: 4,
              color: 'var(--fq-text-primary)', background: 'var(--fq-surface-1)', pointerEvents: 'none',
            }}
          >
            <span>{chartTimeKey(crosshairPoint.time)}</span>
            <span>{copy.open} {crosshairPoint.open.toFixed(2)}</span>
            <span>{copy.high} {crosshairPoint.high.toFixed(2)}</span>
            <span>{copy.low} {crosshairPoint.low.toFixed(2)}</span>
            <span>{copy.closeValue} {crosshairPoint.close.toFixed(2)}</span>
            <span>{copy.volumeValue} {crosshairPoint.volume.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</span>
          </div>
        )}
      </div>
      <div style={{ marginTop: 10, borderTop: '1px solid var(--fq-border)', paddingTop: 8 }}>
        <Text strong>{copy.volume}</Text>
        <div ref={volumeRef} data-testid="pro-chart-volume" aria-label={copy.volume} style={{ height: 96, minWidth: 0 }} />
      </div>
      <div style={{ marginTop: 10, borderTop: '1px solid var(--fq-border)', paddingTop: 8 }}>
        <Text strong>{copy.indicator}</Text>
        <div ref={indicatorRef} data-testid="pro-chart-indicator" aria-label={copy.indicator} style={{ height: 160, minWidth: 0 }} />
      </div>
      <div style={{ marginTop: 12 }}>
        <Text strong>{copy.markerTitle}</Text>
        <Space wrap style={{ display: 'flex', marginTop: 6 }}>
          {researchMarkers.length ? researchMarkers.map(({ report, verdict }) => (
            <Button key={report.id} size="small" onClick={() => setSelectedReportId(report.id)}>
              {report.created_at.slice(0, 10)} · {copy.verdict[verdict]} · #{report.id}
            </Button>
          )) : <Text type="secondary">{copy.noReports}</Text>}
        </Space>
      </div>
      <Drawer
        title={selectedReport ? `${copy.report} #${selectedReport.id}` : copy.report}
        open={selectedReport !== null}
        onClose={() => setSelectedReportId(null)}
        width="min(520px, 92vw)"
        extra={<Button onClick={() => setSelectedReportId(null)}>{copy.close}</Button>}
      >
        {selectedReport && selectedVerdict && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Text strong>{selectedReport.company_name || selectedReport.ticker}</Text>
            <Space wrap>
              <Tag>{copy.verdict[selectedVerdict]}</Tag>
              <Text type="secondary">{copy.reportTime}: {selectedReport.created_at}</Text>
            </Space>
            <Paragraph>{reportCoreText(selectedReport) ?? copy.summaryMissing}</Paragraph>
            {selectedVerdict === 'unknown' && (
              <Text type="secondary">{copy.unknown}: {typeof selectedReport.report_data.verdict === 'string' ? selectedReport.report_data.verdict : copy.unavailable}</Text>
            )}
          </Space>
        )}
      </Drawer>
    </section>
  );
}
