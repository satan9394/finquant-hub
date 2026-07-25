/* ============================================================
 * StockAnalysis — 个股分析页（/analysis/:ticker）
 * 功能：搜索 + 行情条 + 信号标签 + K线图(KDJ/MACD/RSI子图) + 13章分析简报
 * ============================================================ */
import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Row, Col, Typography, Input, Button, Spin, Empty, Tag, Collapse, Descriptions, message, Alert,
} from 'antd';
import {
  SearchOutlined, ArrowUpOutlined, ArrowDownOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { createChart, ColorType, LineStyle, CrosshairMode, type IChartApi, type Time } from 'lightweight-charts';
import { fetchQuote, fetchKLine, fetchIndicators, searchStocks } from '../services/stockApi';
import { requestAnalysis } from '../services/analysisApi';
import type {
  RealTimeQuote, KLineDataPoint, IndicatorData, SearchResult, SignalBadge, AnalysisSection,
} from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

const { Title, Text } = Typography;

// ==================== 常用格式化 ====================
const fmtPrice = (v?: number | null) => (v != null ? v.toFixed(2) : '--');
const fmtVolume = (v?: number | null) => (v != null ? (v >= 1e8 ? `${(v / 1e8).toFixed(2)}亿` : v >= 1e4 ? `${(v / 1e4).toFixed(0)}万` : `${v}`) : '--');
const fmtPercent = (v?: number | null) => (v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '--');
const fmtChange = (v?: number | null) => (v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}` : '--');

// ==================== 技术指标子图组件 ====================
function IndicatorSubChart({
  title, labels, datasets, height = 100, theme = 'light',
}: {
  title: string;
  labels: string[];
  datasets: { label: string; data: (number | null)[]; color: string }[];
  height?: number;
  theme?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!ref.current || labels.length === 0) return;
    const isDark = theme === 'dark';
    const chart = createChart(ref.current, {
      height,
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#1f1f1f' : '#ffffff' },
        textColor: isDark ? '#d1d4dc' : '#666',
        fontSize: 10,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: isDark ? '#2B2B43' : '#f0f0f0' },
        horzLines: { color: isDark ? '#2B2B43' : '#f0f0f0' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: {
        visible: false,
        fixRightEdge: true,
      },
      rightPriceScale: {
        scaleMargins: { top: 0.1, bottom: 0.1 },
        borderVisible: false,
      },
      handleScroll: false,
      handleScale: false,
    });
    chartRef.current = chart;

    datasets.forEach((ds) => {
      if (ds.label === 'HIST' && ds.color === '#4a90d9') {
        // MACD 柱状图（histogram）
        const series = chart.addHistogramSeries({
          color: '#4a90d9',
          priceFormat: { type: 'volume' },
          priceScaleId: 'hist',
        });
        chart.priceScale('hist').applyOptions({ scaleMargins: { top: 0.3, bottom: 0 } });
        const histData = labels.map((t, i) => ({
          time: t as Time,
          value: Math.abs(ds.data[i] ?? 0),
          color: (ds.data[i] ?? 0) >= 0 ? '#f23645' : '#089981',
        })).filter((d) => d.value !== 0);
        if (histData.length > 0) series.setData(histData);
      } else {
        const series = chart.addLineSeries({
          color: ds.color,
          lineWidth: 1,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
        });
        const lineData = labels.map((t, i) => ({
          time: t as Time,
          value: ds.data[i] ?? 0,
        })).filter((d) => d.value !== 0);
        if (lineData.length > 0) series.setData(lineData);
      }
    });

    chart.timeScale().fitContent();

    return () => { chart.remove(); chartRef.current = null; };
  }, [labels, theme]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#888', padding: '2px 8px' }}>{title}</div>
      <div ref={ref} />
    </div>
  );
}

// ==================== 信号标签 ====================
function SignalBadges({ signals }: { signals: SignalBadge[] }) {
  if (!signals?.length) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
      {signals.map((s, i) => (
        <Tag key={i} color={s.type === 'bullish' ? 'red' : s.type === 'bearish' ? 'green' : 'default'}>
          {s.type === 'bullish' ? '📈' : s.type === 'bearish' ? '📉' : '⚪'} {s.label}
        </Tag>
      ))}
    </div>
  );
}

// ==================== 行情条 ====================
function PriceStatsBar({ quote }: { quote: RealTimeQuote }) {
  const isUp = (quote.change_percent ?? 0) >= 0;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '8px 0',
    }}>
      <div>
        <span style={{ fontSize: 28, fontWeight: 700, fontFamily: 'monospace', color: isUp ? '#f23645' : '#089981' }}>
          {fmtPrice(quote.price)}
        </span>
        <span style={{ fontSize: 13, marginLeft: 8, color: isUp ? '#f23645' : '#089981' }}>
          {fmtChange(quote.change)} ({fmtPercent(quote.change_percent)})
        </span>
      </div>
      {[
        { label: '今开', value: fmtPrice(quote.open) },
        { label: '最高', value: fmtPrice(quote.high) },
        { label: '最低', value: fmtPrice(quote.low) },
        { label: '昨收', value: fmtPrice(quote.last_close) },
        { label: '振幅', value: fmtPercent(quote.amplitude) },
        { label: '成交量', value: fmtVolume(quote.volume) },
        { label: '成交额', value: fmtVolume(quote.amount) },
        { label: '换手率', value: fmtPercent(quote.turnover_rate) },
        { label: '市盈率', value: quote.pe != null ? quote.pe.toFixed(2) : '--' },
        { label: '市净率', value: quote.pb != null ? quote.pb.toFixed(2) : '--' },
        { label: '市值', value: quote.market_cap != null ? fmtVolume(quote.market_cap) : '--' },
      ].map((item) => (
        <div key={item.label} style={{ textAlign: 'center', minWidth: 60 }}>
          <div style={{ fontSize: 11, color: '#999' }}>{item.label}</div>
          <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'monospace' }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

// ==================== 分析章节目录 ====================
const CHAPTER_TITLES = [
  '公司概况', '行业分析', '主营业务分析', '财务概览', '盈利能力分析',
  '成长能力分析', '偿债能力分析', '运营能力分析', '现金流分析',
  '股东结构分析', '机构评级', '风险提示', '投资建议',
];

// ==================== 页面组件 ====================
export default function StockAnalysis() {
  const { ticker } = useParams<{ ticker: string }>();
  const navigate = useNavigate();

  // 搜索
  const [searchQuery, setSearchQuery] = useState(ticker ?? '');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  // 数据
  const [quote, setQuote] = useState<RealTimeQuote | null>(null);
  const [klineData, setKlineData] = useState<KLineDataPoint[]>([]);
  const [indicators, setIndicators] = useState<IndicatorData | null>(null);
  const [analysisSections, setAnalysisSections] = useState<AnalysisSection[]>([]);
  const [signals, setSignals] = useState<SignalBadge[]>([]);

  // 状态
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [loadingKline, setLoadingKline] = useState(false);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | string[]>([]);

  // 当前有效 ticker
  const currentTicker = ticker ?? '';

  // ---------- 搜索 ----------
  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); return; }
    try {
      const res = await searchStocks(q);
      setSearchResults(res);
    } catch { setSearchResults([]); }
  }, []);

  const handleSelectStock = (code: string) => {
    setSearchResults([]);
    setSearchQuery('');
    navigate(`/analysis/${code}`);
  };

  // ---------- 加载行情 ----------
  useEffect(() => {
    if (!currentTicker) return;
    setLoadingQuote(true);
    fetchQuote(currentTicker)
      .then(setQuote)
      .catch(() => setQuote(null))
      .finally(() => setLoadingQuote(false));
  }, [currentTicker]);

  // ---------- 加载 K 线 ----------
  useEffect(() => {
    if (!currentTicker) return;
    setLoadingKline(true);
    Promise.all([
      fetchKLine(currentTicker, '1d', 120),
      fetchIndicators(currentTicker, 'macd,kdj,rsi'),
    ])
      .then(([klines, ind]) => {
        setKlineData(klines);
        setIndicators(ind);
      })
      .catch(() => {})
      .finally(() => setLoadingKline(false));
  }, [currentTicker]);

  // ---------- 请求 AI 分析 ----------
  const handleAnalyze = useCallback(async () => {
    if (!currentTicker) return;
    setLoadingAnalysis(true);
    setAnalysisError(null);
    try {
      const res = await requestAnalysis({ ticker: currentTicker });
      setAnalysisSections(res.sections ?? []);
      setSignals(res.signals ?? []);
      // 默认展开前两章
      setActiveKey(['0', '1']);
    } catch (e: any) {
      setAnalysisError(e.message || '分析请求失败');
    } finally {
      setLoadingAnalysis(false);
    }
  }, [currentTicker]);

  // 进入页面自动请求分析
  useEffect(() => {
    if (currentTicker) handleAnalyze();
  }, [currentTicker, handleAnalyze]);

  // ---------- K 线图主面板（顶部） ----------
  const mainChartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mainChartRef.current || klineData.length === 0) return;
    const isDark = false;
    const chart = createChart(mainChartRef.current, {
      height: 320,
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#191919',
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '#e0e3eb' },
        horzLines: { color: '#e0e3eb' },
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: '#9B9B9B', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#F0F0F0' },
        horzLine: { color: '#9B9B9B', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#F0F0F0' },
      },
      rightPriceScale: {
        scaleMargins: { top: 0.08, bottom: 0.25 },
        borderColor: '#e0e3eb',
      },
      timeScale: {
        borderColor: '#e0e3eb',
        timeVisible: true,
        secondsVisible: false,
        fixRightEdge: true,
      },
      localization: { locale: 'zh-CN', dateFormat: 'yyyy-MM-dd' },
    });

    const candles = klineData.map((k) => ({
      time: k.day as Time,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
    }));

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#f23645',
      downColor: '#089981',
      borderUpColor: '#f23645',
      borderDownColor: '#089981',
      wickUpColor: '#f23645',
      wickDownColor: '#089981',
    });
    candlestickSeries.setData(candles);

    // 成交量（histogram）
    const volumeSeries = chart.addHistogramSeries({
      color: '#4a90d9',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    const volData = klineData.map((k) => ({
      time: k.day as Time,
      value: Math.round(k.volume / 100),
      color: k.close >= k.open ? 'rgba(242, 54, 69, 0.4)' : 'rgba(8, 153, 137, 0.4)',
    }));
    volumeSeries.setData(volData);

    // MA 均线
    if (indicators?.indicators?.ma) {
      const ma = indicators.indicators.ma;
      if (ma.ma5) {
        const ma5Series = chart.addLineSeries({ color: '#fdb02c', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        ma5Series.setData(klineData.map((k, i) => ({ time: k.day as Time, value: ma.ma5[i] ?? 0 })).filter(d => d.value !== 0));
      }
      if (ma.ma10) {
        const ma10Series = chart.addLineSeries({ color: '#4a90d9', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        ma10Series.setData(klineData.map((k, i) => ({ time: k.day as Time, value: ma.ma10[i] ?? 0 })).filter(d => d.value !== 0));
      }
      if (ma.ma20) {
        const ma20Series = chart.addLineSeries({ color: '#8b5cf6', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        ma20Series.setData(klineData.map((k, i) => ({ time: k.day as Time, value: ma.ma20[i] ?? 0 })).filter(d => d.value !== 0));
      }
    }

    chart.timeScale().fitContent();

    return () => { chart.remove(); };
  }, [klineData, indicators]);

  // ---------- 子图数据 ----------
  const indicatorDays = indicators?.days ?? [];
  const macdData = indicators?.indicators?.macd;
  const kdjData = indicators?.indicators?.kdj;
  const rsiData = indicators?.indicators?.rsi;

  // ---------- 渲染分析章节 ----------
  const collapseItems = CHAPTER_TITLES.map((title, index) => {
    const section = analysisSections.find((s) => s.order === index + 1);
    const content = section?.content ?? '暂无数据';
    return {
      key: String(index),
      label: <span style={{ fontWeight: 500 }}>{index + 1}. {title}</span>,
      children: (
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.8, color: '#333' }}>
          {content}
        </div>
      ),
    };
  });

  // ==================== 渲染 ====================
  return (
    <div style={{ padding: 24 }}>
      {/* 搜索栏 */}
      <div style={{ marginBottom: 16, position: 'relative' }}>
        <Input.Search
          placeholder="输入股票代码或名称快速切换"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          onSearch={(val) => val && handleSelectStock(val)}
          enterButton={<><SearchOutlined /> 搜索</>}
          style={{ maxWidth: 400 }}
        />
        {searchResults.length > 0 && (
          <div style={{
            position: 'absolute', top: 40, left: 0, width: 400, zIndex: 100,
            background: '#fff', border: '1px solid #f0f0f0', borderRadius: 4,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          }}>
            {searchResults.slice(0, 8).map((item) => (
              <div
                key={item.code}
                onClick={() => handleSelectStock(item.code)}
                style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#fafafa')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Text strong>{item.name}</Text>
                <Text style={{ marginLeft: 8, color: '#888', fontSize: 12 }}>{item.code}</Text>
              </div>
            ))}
          </div>
        )}
      </div>

      {!currentTicker ? (
        <Empty description="请输入股票代码开始分析" style={{ marginTop: 80 }} />
      ) : (
        <>
          {/* 标题 + 信号 */}
          <div style={{ marginBottom: 8 }}>
            <Title level={4} style={{ margin: 0, display: 'inline' }}>{currentTicker.toUpperCase()} 分析</Title>
            {quote && (
              <Text style={{ marginLeft: 8, fontSize: 16, color: '#666' }}>{quote.name}</Text>
            )}
          </div>
          <SignalBadges signals={signals} />

          {/* 行情条 */}
          <Card size="small" style={{ marginBottom: 12 }} loading={loadingQuote}>
            {quote ? <PriceStatsBar quote={quote} /> : <Text type="secondary">加载行情中...</Text>}
          </Card>

          {/* K 线图 + 技术指标子图 */}
          <Card size="small" style={{ marginBottom: 16 }} loading={loadingKline}>
            <div ref={mainChartRef} />
            {indicatorDays.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {kdjData && (
                  <IndicatorSubChart
                    title="KDJ"
                    labels={indicatorDays}
                    datasets={[
                      { label: 'K', data: kdjData.k ?? [], color: '#f23645' },
                      { label: 'D', data: kdjData.d ?? [], color: '#089981' },
                      { label: 'J', data: kdjData.j ?? [], color: '#4a90d9' },
                    ]}
                  />
                )}
                {macdData && (
                  <IndicatorSubChart
                    title="MACD"
                    labels={indicatorDays}
                    datasets={[
                      { label: 'DIF', data: macdData.dif ?? [], color: '#f23645' },
                      { label: 'DEA', data: macdData.dea ?? [], color: '#089981' },
                      { label: 'HIST', data: macdData.hist ?? [], color: '#4a90d9' },
                    ]}
                  />
                )}
                {rsiData && (
                  <IndicatorSubChart
                    title="RSI"
                    labels={indicatorDays}
                    datasets={[
                      { label: 'RSI6', data: rsiData.rsi6 ?? [], color: '#f23645' },
                      { label: 'RSI12', data: rsiData.rsi12 ?? [], color: '#089981' },
                      { label: 'RSI24', data: rsiData.rsi24 ?? [], color: '#4a90d9' },
                    ]}
                  />
                )}
              </div>
            )}
          </Card>

          {/* AI 分析报告 */}
          <Card
            size="small"
            title="AI 智能分析报告"
            extra={
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={handleAnalyze}
                loading={loadingAnalysis}
              >
                {loadingAnalysis ? '分析中...' : '重新分析'}
              </Button>
            }
          >
            {analysisError && (
              <Alert type="error" message={analysisError} style={{ marginBottom: 12 }} showIcon closable />
            )}
            {loadingAnalysis ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Spin tip="正在生成分析报告，请耐心等待..." />
              </div>
            ) : analysisSections.length > 0 ? (
              <Collapse
                activeKey={activeKey}
                onChange={(keys) => setActiveKey(keys)}
                items={collapseItems}
                size="small"
              />
            ) : (
              <Empty description={'点击「重新分析」获取 AI 分析报告'} />
            )}
          </Card>
        </>
      )}

      {/* 免责声明 */}
      <div style={{ textAlign: 'center', fontSize: 11, color: '#bbb', marginTop: 24 }}>
        此内容由 AI 生成，不构成投资建议
      </div>
    </div>
  );
}
