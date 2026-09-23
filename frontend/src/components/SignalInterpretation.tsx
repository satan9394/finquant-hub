import { Alert, Card, Empty, Space, Tag, Typography } from 'antd';

import type { SignalBadge } from '../types';

const { Text } = Typography;

type Direction = SignalBadge['type'];

const SIGNAL_COPY: Record<string, { name: string; horizon: string; explanation: string }> = {
  golden_cross: { name: 'MACD 金叉', horizon: '中期', explanation: 'DIF 上穿 DEA，日线动能阶段性转强。' },
  death_cross: { name: 'MACD 死叉', horizon: '中期', explanation: 'DIF 下穿 DEA，日线动能阶段性转弱。' },
  top_divergence: { name: 'MACD 顶背离', horizon: '中期', explanation: '价格创新高但动能未同步增强，需防范回落。' },
  bottom_divergence: { name: 'MACD 底背离', horizon: '中期', explanation: '价格创新低但动能未同步走弱，存在修复可能。' },
  breakout_up: { name: '向上突破 20 日高点', horizon: '短中期', explanation: '收盘价突破近 20 日高点，趋势可能转强。' },
  breakout_down: { name: '向下跌破 20 日低点', horizon: '短中期', explanation: '收盘价跌破近 20 日低点，趋势可能转弱。' },
  volume_surge: { name: '成交量显著放大', horizon: '短期', explanation: '量能明显增加，本身不判断涨跌方向。' },
  rsi_oversold: { name: 'RSI 进入超卖区', horizon: '短期', explanation: '短线跌幅较集中，可能出现修复，但不代表已经反转。' },
  rsi_overbought: { name: 'RSI 进入超买区', horizon: '短期', explanation: '短线上涨较集中，回撤风险增加，但不代表立即反转。' },
};

const DIRECTION_COPY: Record<Direction, { heading: string; color: string }> = {
  bullish: { heading: '看多证据', color: 'red' },
  bearish: { heading: '看空证据', color: 'green' },
  neutral: { heading: '中性 / 确认证据', color: 'default' },
};

export function interpretSignals(signals: SignalBadge[]) {
  const bullish = signals.filter((signal) => signal.type === 'bullish').length;
  const bearish = signals.filter((signal) => signal.type === 'bearish').length;
  const neutral = signals.length - bullish - bearish;

  return {
    verdict: bullish > bearish ? '偏强' : bearish > bullish ? '偏弱' : '中性',
    horizon: '日线 · 短中期',
    hasConflict: bullish > 0 && bearish > 0,
    bullish,
    bearish,
    neutral,
  } as const;
}

function SignalEvidence({ signals }: { signals: SignalBadge[] }) {
  if (!signals.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="近期未检测到技术事件" />;

  return (
    <div className="signal-evidence-groups">
      {(['bullish', 'bearish', 'neutral'] as Direction[]).map((direction) => {
        const items = signals.filter((signal) => signal.type === direction);
        if (!items.length) return null;
        const directionCopy = DIRECTION_COPY[direction];
        return (
          <section key={direction} aria-label={directionCopy.heading} className="signal-evidence-group">
            <Tag color={directionCopy.color}>{directionCopy.heading} · {items.length}</Tag>
            <ul>
              {items.map((signal, index) => {
                const copy = SIGNAL_COPY[signal.label];
                return (
                  <li key={`${signal.label}-${index}`}>
                    <Space size={6} wrap>
                      <Text strong>{copy?.name ?? '未识别技术信号'}</Text>
                      <Tag bordered={false}>{copy?.horizon ?? '尺度未知'}</Tag>
                    </Space>
                    <div><Text type="secondary">{copy?.explanation ?? '当前版本尚未提供该信号的可验证解释。'}</Text></div>
                    {copy && signal.description && <div className="signal-raw-description">检测详情：{signal.description}</div>}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export default function SignalInterpretation({
  signals,
  ready,
  mode = 'all',
}: {
  signals: SignalBadge[];
  ready: boolean;
  mode?: 'summary' | 'evidence' | 'all';
}) {
  if (!ready) return <Alert type="info" showIcon message="尚未计算技术信号" description="点击“刷新分析”后再查看当前结论与证据。" />;

  const interpretation = interpretSignals(signals);
  const summary = (
    <Card size="small" title="技术信号结论">
      <Space size={[8, 8]} wrap>
        <Tag color={interpretation.verdict === '偏强' ? 'red' : interpretation.verdict === '偏弱' ? 'green' : 'default'}>
          {interpretation.verdict}
        </Tag>
        <Tag>{interpretation.horizon}</Tag>
        {interpretation.hasConflict && <Tag color="orange">多空信号并存</Tag>}
      </Space>
      <div className="signal-counts">
        看多 {interpretation.bullish} · 看空 {interpretation.bearish} · 中性 {interpretation.neutral}
      </div>
      <Text type="secondary">
        结论仅比较当前返回的近期事件数量；事件可能已发生于近 20 个交易日内，不代表持续持仓建议。
      </Text>
      {interpretation.hasConflict && (
        <Alert
          type="warning"
          showIcon
          message="不同指标给出相反方向，当前结论存在分歧"
          description="请结合下方原始指标、价格位置与检测详情核对，不应只按多数信号行动。"
          style={{ marginTop: 12 }}
        />
      )}
    </Card>
  );
  const evidence = <Card size="small" title="技术信号证据"><SignalEvidence signals={signals} /></Card>;

  if (mode === 'summary') return summary;
  if (mode === 'evidence') return evidence;
  return <Space direction="vertical" size={12} style={{ width: '100%' }}>{summary}{evidence}</Space>;
}
