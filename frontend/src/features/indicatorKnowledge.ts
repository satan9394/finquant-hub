export const INDICATOR_KEYS = ['ma', 'macd', 'kdj', 'rsi'] as const;

export type IndicatorKey = typeof INDICATOR_KEYS[number];

export interface IndicatorKnowledge {
  key: IndicatorKey;
  shortName: string;
  title: string;
  purpose: string;
  reading: string;
  method: string;
  pitfall: string;
}

export const INDICATOR_KNOWLEDGE: Record<IndicatorKey, IndicatorKnowledge> = {
  ma: {
    key: 'ma',
    shortName: 'MA',
    title: 'MA 移动平均线',
    purpose: '平滑每日价格波动，比较不同周期的趋势方向。',
    reading: '短期均线位于长期均线上方，表示近期平均价格更强；交叉需要结合持续时间和价格位置确认。',
    method: '当前图表显示收盘价简单移动平均 MA5、MA10、MA20；知识页同时说明更长周期的用途。',
    pitfall: '均线只使用历史价格且天然滞后；震荡行情中交叉可能频繁反复。',
  },
  macd: {
    key: 'macd',
    shortName: 'MACD',
    title: 'MACD 指数平滑异同移动平均',
    purpose: '比较快慢指数均线，观察日线趋势动能的方向和变化。',
    reading: 'DIF 与 DEA 的相对位置描述动能方向，MACD 柱的扩张或收缩用于观察两者差距。',
    method: '参数为 12、26、9；DIF=EMA12−EMA26，DEA=EMA9(DIF)，MACD 柱=2×(DIF−DEA)。',
    pitfall: '它仍基于历史价格并可能滞后；零轴附近可能频繁交叉，单次金叉或死叉不是独立交易依据。',
  },
  kdj: {
    key: 'kdj',
    shortName: 'KDJ',
    title: 'KDJ 随机指标',
    purpose: '衡量收盘价在近期高低区间中的相对位置，观察短线动量。',
    reading: 'K 与 D 的相对位置和交叉用于观察动量，J 对变化更敏感，可高于 100 或低于 0。',
    method: '参数为 9、3、3；先计算 9 日 RSV，再以递推平滑得到 K、D，J=3K−2D。',
    pitfall: '高位或低位可以持续很久；所谓超买、超卖不等于价格会立即反转。',
  },
  rsi: {
    key: 'rsi',
    shortName: 'RSI',
    title: 'RSI 相对强弱指标',
    purpose: '比较一段时间内上涨幅度与总波动，观察短中期动量强弱。',
    reading: 'RSI6、RSI12、RSI24 分别反映不同周期；70 与 30 是常见参考区间，不是硬性买卖线。',
    method: '使用 6、12、24 日 Wilder 递推平滑，值域通常为 0–100；首个无变化样本保持为空。',
    pitfall: '强趋势中 RSI 可长期处于高位或低位；阈值触发只能说明状态变化，不能确认反转。',
  },
};

export function isIndicatorKey(value: string | null): value is IndicatorKey {
  return value != null && (INDICATOR_KEYS as readonly string[]).includes(value);
}
