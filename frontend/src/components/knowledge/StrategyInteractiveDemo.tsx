import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Alert, Button, Empty, Input, InputNumber, Slider, Space, Spin, Typography } from 'antd';
import { PauseOutlined, PlayCircleOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { EChartsOption } from 'echarts';
import { useNavigate } from 'react-router-dom';

import LazyEChart from '../LazyEChart';
import { useLanguage } from '../../i18n/LanguageContext';
import { fetchInstrumentBars } from '../../services/researchApi';
import type { Bar, BarsResponse } from '../../types/research';
import { readChartTokens } from '../../styles/themeTokens';

const { Text } = Typography;

export type StrategyKey = 'm1' | 'm2' | 'm3' | 'm4' | 'm5' | 'm6' | 'm7' | 'm8';
type Direction = 'buy' | 'sell';

type Signal = {
  day: string;
  price: number;
  direction: Direction;
  reason: string;
};

type StrategyConfig = {
  key: StrategyKey;
  firstLabel: string;
  secondLabel: string;
  firstDefault: number;
  firstMin: number;
  firstMax: number;
  firstStep: number;
  secondDefault: number;
  secondMin: number;
  secondMax: number;
  secondStep: number;
  proxy: boolean;
};

const strategyConfigs: Record<StrategyKey, StrategyConfig> = {
  m1: { key: 'm1', firstLabel: 'library.demo.shortWindow', secondLabel: 'library.demo.longWindow', firstDefault: 8, firstMin: 2, firstMax: 60, firstStep: 1, secondDefault: 24, secondMin: 4, secondMax: 120, secondStep: 1, proxy: false },
  m2: { key: 'm2', firstLabel: 'library.demo.lookback', secondLabel: 'library.demo.deviation', firstDefault: 20, firstMin: 5, firstMax: 60, firstStep: 1, secondDefault: 2, secondMin: 0.5, secondMax: 4, secondStep: 0.5, proxy: false },
  m3: { key: 'm3', firstLabel: 'library.demo.lookback', secondLabel: 'library.demo.momentumThreshold', firstDefault: 10, firstMin: 2, firstMax: 60, firstStep: 1, secondDefault: 0, secondMin: 0, secondMax: 10, secondStep: 0.5, proxy: false },
  m4: { key: 'm4', firstLabel: 'library.demo.lookback', secondLabel: 'library.demo.neutralBand', firstDefault: 20, firstMin: 5, firstMax: 60, firstStep: 1, secondDefault: 2, secondMin: 0.5, secondMax: 8, secondStep: 0.5, proxy: true },
  m5: { key: 'm5', firstLabel: 'library.demo.lookback', secondLabel: 'library.demo.spreadThreshold', firstDefault: 20, firstMin: 5, firstMax: 60, firstStep: 1, secondDefault: 2, secondMin: 0.5, secondMax: 4, secondStep: 0.5, proxy: true },
  m6: { key: 'm6', firstLabel: 'library.demo.volumeMultiple', secondLabel: 'library.demo.gapThreshold', firstDefault: 1.8, firstMin: 1, firstMax: 5, firstStep: 0.1, secondDefault: 1.5, secondMin: 0.5, secondMax: 8, secondStep: 0.5, proxy: true },
  m7: { key: 'm7', firstLabel: 'library.demo.fastFeature', secondLabel: 'library.demo.slowFeature', firstDefault: 5, firstMin: 2, firstMax: 30, firstStep: 1, secondDefault: 20, secondMin: 5, secondMax: 90, secondStep: 1, proxy: true },
  m8: { key: 'm8', firstLabel: 'library.demo.lookback', secondLabel: 'library.demo.rangeThreshold', firstDefault: 20, firstMin: 5, firstMax: 60, firstStep: 1, secondDefault: 1.5, secondMin: 0.5, secondMax: 8, secondStep: 0.5, proxy: true },
};

function mean(values: number[], index: number, window: number): number | null {
  if (index + 1 < window) return null;
  const slice = values.slice(index - window + 1, index + 1);
  return slice.reduce((sum, value) => sum + value, 0) / window;
}

function deviation(values: number[], index: number, window: number, center: number): number | null {
  if (index + 1 < window) return null;
  const slice = values.slice(index - window + 1, index + 1);
  const variance = slice.reduce((sum, value) => sum + ((value - center) ** 2), 0) / window;
  return Math.sqrt(variance);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

function calculateSignals(
  bars: Bar[],
  strategy: StrategyKey,
  firstParameter: number,
  secondParameter: number,
  t: (key: string, values?: Record<string, string | number>) => string,
): Signal[] {
  const closes = bars.map((bar) => bar.close);
  const volumes = bars.map((bar) => bar.volume);
  const signals: Signal[] = [];
  const push = (index: number, direction: Direction, reasonKey: string, values: Record<string, number>) => {
    const bar = bars[index];
    if (bar) signals.push({ day: bar.day, price: bar.close, direction, reason: t(reasonKey, values) });
  };

  for (let index = 1; index < bars.length; index += 1) {
    const close = closes[index];
    const previousClose = closes[index - 1];
    if (strategy === 'm1') {
      const shortWindow = Math.round(firstParameter);
      const longWindow = Math.round(secondParameter);
      const shortNow = mean(closes, index, shortWindow);
      const shortBefore = mean(closes, index - 1, shortWindow);
      const longNow = mean(closes, index, longWindow);
      const longBefore = mean(closes, index - 1, longWindow);
      if (shortBefore != null && longBefore != null && shortNow != null && longNow != null) {
        if (shortBefore <= longBefore && shortNow > longNow) push(index, 'buy', 'library.demo.reason.maBuy', { short: shortWindow, long: longWindow });
        if (shortBefore >= longBefore && shortNow < longNow) push(index, 'sell', 'library.demo.reason.maSell', { short: shortWindow, long: longWindow });
      }
      continue;
    }

    if (strategy === 'm2' || strategy === 'm4' || strategy === 'm5') {
      const window = Math.round(firstParameter);
      const center = mean(closes, index, window);
      const previousCenter = mean(closes, index - 1, window);
      if (center == null || previousCenter == null) continue;
      const currentDeviation = strategy === 'm4' ? center * secondParameter / 100 : deviation(closes, index, window, center);
      const previousDeviation = strategy === 'm4' ? previousCenter * secondParameter / 100 : deviation(closes, index - 1, window, previousCenter);
      if (currentDeviation == null || previousDeviation == null) continue;
      const multiplier = strategy === 'm5' ? secondParameter : strategy === 'm2' ? secondParameter : 1;
      const lowerNow = center - currentDeviation * multiplier;
      const lowerBefore = previousCenter - previousDeviation * multiplier;
      const upperNow = center + currentDeviation * multiplier;
      const upperBefore = previousCenter + previousDeviation * multiplier;
      if (previousClose <= lowerBefore && close > lowerNow) push(index, 'buy', 'library.demo.reason.reentryBuy', { window, threshold: secondParameter });
      if (previousClose >= upperBefore && close < upperNow) push(index, 'sell', 'library.demo.reason.reentrySell', { window, threshold: secondParameter });
      continue;
    }

    if (strategy === 'm3') {
      const window = Math.round(firstParameter);
      if (index < window + 1) continue;
      const nowReturn = (close / closes[index - window] - 1) * 100;
      const beforeReturn = (previousClose / closes[index - window - 1] - 1) * 100;
      if (beforeReturn <= secondParameter && nowReturn > secondParameter) push(index, 'buy', 'library.demo.reason.momentumBuy', { window, threshold: secondParameter });
      if (beforeReturn >= -secondParameter && nowReturn < -secondParameter) push(index, 'sell', 'library.demo.reason.momentumSell', { window, threshold: secondParameter });
      continue;
    }

    if (strategy === 'm6') {
      const avgVolume = mean(volumes, index - 1, 20);
      const gap = bars[index].open ? Math.abs((bars[index].open / previousClose - 1) * 100) : 0;
      if (avgVolume != null && avgVolume > 0 && volumes[index] >= avgVolume * firstParameter && gap >= secondParameter) {
        push(index, close >= bars[index].open ? 'buy' : 'sell', 'library.demo.reason.eventProxy', { volume: firstParameter, gap: secondParameter });
      }
      continue;
    }

    if (strategy === 'm7') {
      const fastNow = mean(closes, index, Math.round(firstParameter));
      const slowNow = mean(closes, index, Math.round(secondParameter));
      const fastBefore = mean(closes, index - 1, Math.round(firstParameter));
      const slowBefore = mean(closes, index - 1, Math.round(secondParameter));
      if (fastNow == null || slowNow == null || fastBefore == null || slowBefore == null) continue;
      const nowBull = fastNow > slowNow && close > fastNow;
      const beforeBull = fastBefore > slowBefore && previousClose > fastBefore;
      if (!beforeBull && nowBull) push(index, 'buy', 'library.demo.reason.mlProxyBuy', { fast: firstParameter, slow: secondParameter });
      if (beforeBull && !nowBull) push(index, 'sell', 'library.demo.reason.mlProxySell', { fast: firstParameter, slow: secondParameter });
      continue;
    }

    if (strategy === 'm8') {
      const priorRange = bars.slice(Math.max(0, index - Math.round(firstParameter)), index)
        .map((bar) => bar.high - bar.low);
      if (priorRange.length < Math.round(firstParameter)) continue;
      const averageRange = priorRange.reduce((sum, value) => sum + value, 0) / priorRange.length;
      const currentRange = bars[index].high - bars[index].low;
      if (averageRange <= 0 || currentRange < averageRange * secondParameter) continue;
      push(index, close >= bars[index].open ? 'buy' : 'sell', 'library.demo.reason.hftProxy', { window: firstParameter, threshold: secondParameter });
    }
  }
  return signals;
}

export default function StrategyInteractiveDemo({ strategy }: { strategy: StrategyKey }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const config = strategyConfigs[strategy];
  const [symbolInput, setSymbolInput] = useState('600519');
  const [activeSymbol, setActiveSymbol] = useState('600519');
  const [payload, setPayload] = useState<BarsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [firstParameter, setFirstParameter] = useState(config.firstDefault);
  const [secondParameter, setSecondParameter] = useState(config.secondDefault);
  const [visibleCount, setVisibleCount] = useState(180);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setFirstParameter(config.firstDefault);
    setSecondParameter(config.secondDefault);
    setPlaying(false);
  }, [config.firstDefault, config.secondDefault, strategy]);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    setPayload(null);
    void fetchInstrumentBars(activeSymbol.trim(), 180)
      .then((response) => {
        if (!current) return;
        const validItems = response.items.filter((bar) => (
          Number.isFinite(bar.open) && Number.isFinite(bar.high) && Number.isFinite(bar.low)
          && Number.isFinite(bar.close) && bar.close > 0 && Number.isFinite(bar.volume)
          && bar.high >= bar.low
        ));
        if (validItems.length === 0) throw new Error(t('library.demo.noBars'));
        setPayload({ ...response, items: validItems });
        setVisibleCount(validItems.length);
      })
      .catch((cause: unknown) => {
        if (!current) return;
        setError(cause instanceof Error ? cause.message : t('library.demo.loadFailed'));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => { current = false; };
  }, [activeSymbol, reloadKey, t]);

  const bars = useMemo(() => [...(payload?.items ?? [])].sort((left, right) => left.day.localeCompare(right.day)), [payload]);
  const displayBars = bars.slice(0, Math.min(visibleCount, bars.length));
  const signals = useMemo(
    () => calculateSignals(displayBars, strategy, firstParameter, secondParameter, t),
    [displayBars, firstParameter, secondParameter, strategy, t],
  );
  const latestBar = displayBars[displayBars.length - 1];
  const latestSignal = signals[signals.length - 1];
  const theme = readChartTokens();
  const dates = displayBars.map((bar) => bar.day);
  const closes = displayBars.map((bar) => bar.close);

  const chartOption = useMemo<EChartsOption>(() => {
    const series: NonNullable<EChartsOption['series']> = [
      {
        name: t('library.demo.close'), type: 'line', data: closes,
        symbol: 'none', showSymbol: false, connectNulls: false,
        lineStyle: { width: 2, color: theme.primary },
        itemStyle: { color: theme.primary },
      },
    ];
    const makeAverage = (window: number, name: string, color: string) => ({
      name, type: 'line' as const, data: closes.map((_, index) => mean(closes, index, window)),
      symbol: 'none' as const, showSymbol: false, connectNulls: false,
      lineStyle: { width: 1.5, color }, itemStyle: { color },
    });
    if (strategy === 'm1') {
      series.push(makeAverage(Math.round(firstParameter), `MA${firstParameter}`, theme.secondary));
      series.push(makeAverage(Math.round(secondParameter), `MA${secondParameter}`, theme.risk));
    }
    if (strategy === 'm2') {
      const window = Math.round(firstParameter);
      const middle = closes.map((_, index) => mean(closes, index, window));
      const upper = closes.map((_, index) => {
        const center = middle[index];
        return center == null ? null : center + (deviation(closes, index, window, center) ?? 0) * secondParameter;
      });
      const lower = closes.map((_, index) => {
        const center = middle[index];
        return center == null ? null : center - (deviation(closes, index, window, center) ?? 0) * secondParameter;
      });
      series.push({ name: t('library.demo.mean'), type: 'line', data: middle, symbol: 'none', showSymbol: false, lineStyle: { width: 1.5, color: theme.secondary } });
      series.push({ name: t('library.demo.upperBand'), type: 'line', data: upper, symbol: 'none', showSymbol: false, lineStyle: { width: 1, type: 'dashed', color: theme.risk } });
      series.push({ name: t('library.demo.lowerBand'), type: 'line', data: lower, symbol: 'none', showSymbol: false, lineStyle: { width: 1, type: 'dashed', color: theme.risk } });
    }
    const signalData = (direction: Direction) => signals
      .filter((signal) => signal.direction === direction)
      .map((signal) => ({ name: signal.reason, value: [signal.day, signal.price] }));
    series.push({ name: t('library.demo.buy'), type: 'scatter', symbol: 'triangle', symbolSize: 12, data: signalData('buy'), itemStyle: { color: theme.up } });
    series.push({ name: t('library.demo.sell'), type: 'scatter', symbol: 'triangle', symbolRotate: 180, symbolSize: 12, data: signalData('sell'), itemStyle: { color: theme.down } });
    return {
      animation: false,
      backgroundColor: theme.background,
      textStyle: { color: theme.text, fontFamily: "Inter, 'PingFang SC', sans-serif" },
      grid: { left: 56, right: 20, top: 20, bottom: 38 },
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'cross' },
        backgroundColor: theme.surface, borderColor: theme.grid,
        textStyle: { color: theme.textPrimary },
        formatter: (params) => {
          const entries = (Array.isArray(params) ? params : [params]);
          const first = entries[0];
          const day = String(first?.name ?? '');
          const bar = displayBars.find((item) => item.day === day);
          if (!bar) return escapeHtml(day);
          const signal = signals.find((item) => item.day === day);
          return `${escapeHtml(day)}<br/>${t('library.demo.close')}: ${bar.close.toFixed(2)}${signal ? `<br/>${t(`library.demo.${signal.direction}`)}: ${escapeHtml(signal.reason)}` : ''}`;
        },
      },
      xAxis: { type: 'category', data: dates, boundaryGap: false, axisLabel: { hideOverlap: true, color: theme.text } },
      yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: theme.grid } }, axisLabel: { color: theme.text } },
      dataZoom: [{ type: 'inside' }],
      series,
    };
  }, [closes, dates, displayBars, firstParameter, secondParameter, signals, strategy, t, theme.background, theme.down, theme.grid, theme.primary, theme.risk, theme.secondary, theme.surface, theme.text, theme.textPrimary, theme.up]);

  useEffect(() => {
    if (!playing) return undefined;
    if (visibleCount >= bars.length) {
      setPlaying(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setVisibleCount((current) => Math.min(current + 1, bars.length)), 220);
    return () => window.clearTimeout(timer);
  }, [bars.length, playing, visibleCount]);

  const loadSymbol = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const candidate = symbolInput.trim();
    if (!candidate) return;
    setPlaying(false);
    setActiveSymbol(candidate);
  };

  const openInLab = () => {
    const parameters = strategy === 'm1'
      ? t('library.demo.labParameters.ma', { short: firstParameter, long: secondParameter })
      : t(`library.demo.labParameters.${strategy}`, { first: firstParameter, second: secondParameter });
    const prompt = t('library.demo.labPrompt', {
      strategy: t(`library.strategy.${strategy}`),
      parameters,
    });
    const query = new URLSearchParams({ symbol: activeSymbol, prompt });
    if (strategy === 'm1') {
      query.set('short_window', String(Math.round(firstParameter)));
      query.set('long_window', String(Math.round(secondParameter)));
    }
    navigate(`/strategy-lab/ma-crossover?${query.toString()}`);
  };

  return (
    <section className="strategy-demo" data-testid="strategy-interactive-demo" aria-label={t(`library.strategy.${strategy}`)}>
      <div className="strategy-demo__notice">
        <Text>{t('library.demo.teachingNotice')}</Text>
        {config.proxy && <span className="strategy-demo__proxy">{t('library.demo.proxyTag')}</span>}
      </div>
      <form className="strategy-demo__symbol" onSubmit={loadSymbol}>
        <label htmlFor="strategy-demo-symbol">{t('library.demo.symbol')}</label>
        <Input
          id="strategy-demo-symbol"
          value={symbolInput}
          maxLength={20}
          onChange={(event) => setSymbolInput(event.target.value)}
          aria-label={t('library.demo.symbol')}
        />
        <Button htmlType="submit" icon={<SearchOutlined />} loading={loading}>{t('library.demo.loadSymbol')}</Button>
      </form>

      {loading && <div className="strategy-demo__loading" role="status"><Spin size="small" /> {t('library.demo.loading')}</div>}
      {error && (
        <Alert
          type="warning"
          showIcon
          message={t('library.demo.loadFailed')}
          description={error}
          action={<Button size="small" icon={<ReloadOutlined />} onClick={() => setReloadKey((current) => current + 1)}>{t('library.demo.retry')}</Button>}
        />
      )}
      {!loading && !error && payload && latestBar && (
        <>
          <div className="strategy-demo__provenance" aria-label={t('library.demo.provenance')}>
            <span>{t('library.demo.provider')}: <strong>{payload.provider ?? 'UNKNOWN'}</strong></span>
            <span>{t('library.demo.asOf')}: <strong>{payload.as_of ?? latestBar.day}</strong></span>
            <span>{t('library.demo.frequency')}: <strong>{payload.frequency ?? t('library.demo.daily')}</strong></span>
            {payload.quality_flags.length > 0 && <span className="strategy-demo__quality">{payload.quality_flags.join(', ')}</span>}
          </div>
          <div className="strategy-demo__controls">
            <div className="strategy-demo__control">
              <label htmlFor="strategy-demo-first">{t(config.firstLabel)}</label>
              <InputNumber
                id="strategy-demo-first"
                aria-label={t(config.firstLabel)}
                min={config.firstMin}
                max={config.firstMax}
                step={config.firstStep}
                precision={config.firstStep < 1 ? 1 : 0}
                value={firstParameter}
                onChange={(value) => {
                  if (value == null) return;
                  setFirstParameter(value);
                  if ((strategy === 'm1' || strategy === 'm7') && value >= secondParameter) {
                    setSecondParameter(Math.min(config.secondMax, value + 1));
                  }
                }}
              />
            </div>
            <div className="strategy-demo__control">
              <label htmlFor="strategy-demo-second">{t(config.secondLabel)}</label>
              <InputNumber
                id="strategy-demo-second"
                aria-label={t(config.secondLabel)}
                min={config.secondMin}
                max={config.secondMax}
                step={config.secondStep}
                precision={config.secondStep < 1 ? 1 : 0}
                value={secondParameter}
                onChange={(value) => {
                  if (value == null) return;
                  setSecondParameter(value);
                  if ((strategy === 'm1' || strategy === 'm7') && value <= firstParameter) {
                    setFirstParameter(Math.max(config.firstMin, value - 1));
                  }
                }}
              />
            </div>
            <Button type="primary" aria-label={t('library.demo.openLab')} icon={<SearchOutlined />} onClick={openInLab}>{t('library.demo.openLab')}</Button>
          </div>

          <div className="strategy-demo__summary">
            <div><span>{t('library.demo.currentPrice')}</span><strong>{latestBar.close.toFixed(2)}</strong></div>
            <div><span>{t('library.demo.visibleBars')}</span><strong>{displayBars.length} / {bars.length}</strong></div>
            <div className={latestSignal?.direction === 'buy' ? 'is-buy' : latestSignal?.direction === 'sell' ? 'is-sell' : ''}>
              <span>{t('library.demo.latestSignal')}</span>
              <strong>{latestSignal ? t(`library.demo.${latestSignal.direction}`) : t('library.demo.noSignal')}</strong>
            </div>
            {latestSignal && <p>{latestSignal.day} · {latestSignal.reason} · {latestSignal.price.toFixed(2)}</p>}
          </div>

          <div className="strategy-demo__chart" role="img" aria-label={t('library.demo.chartLabel', { symbol: activeSymbol, count: displayBars.length })}>
            {displayBars.length >= 2 ? <LazyEChart option={chartOption} style={{ height: 340, width: '100%' }} notMerge /> : <Empty description={t('library.demo.needMoreBars')} />}
          </div>

          <div className="strategy-demo__timeline">
            <Button
              icon={playing ? <PauseOutlined /> : <PlayCircleOutlined />}
              disabled={bars.length < 2}
              onClick={() => {
                if (playing) setPlaying(false);
                else {
                  if (visibleCount >= bars.length) setVisibleCount(Math.min(30, bars.length));
                  setPlaying(true);
                }
              }}
            >{playing ? t('library.demo.pause') : t('library.demo.play')}</Button>
            <div className="strategy-demo__scrubber">
              <label htmlFor="strategy-demo-timeline">{t('library.demo.timeline')}</label>
              <Slider
                id="strategy-demo-timeline"
                ariaLabelForHandle={t('library.demo.timeline')}
                min={Math.min(2, bars.length)}
                max={Math.max(2, bars.length)}
                value={Math.min(visibleCount, bars.length)}
                onChange={(value) => { setPlaying(false); setVisibleCount(value); }}
                tooltip={{ formatter: (value) => t('library.demo.timelineValue', { count: value ?? 0, total: bars.length }) }}
              />
            </div>
            <Text type="secondary">{displayBars.length} / {bars.length}</Text>
          </div>
          <div className="strategy-demo__legend">
            <span className="is-buy">▲ {t('library.demo.buy')}</span>
            <span className="is-sell">▼ {t('library.demo.sell')}</span>
            <span className="strategy-demo__rule">{t(`library.demo.rule.${strategy}`)}</span>
          </div>
          <Space className="strategy-demo__footnote" size={6}>
            <Text type="secondary">{t('library.demo.signalDisclaimer')}</Text>
          </Space>
        </>
      )}
    </section>
  );
}
