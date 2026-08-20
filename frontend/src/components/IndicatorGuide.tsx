import { Card, Collapse, Descriptions, Space, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';

import { INDICATOR_KEYS, INDICATOR_KNOWLEDGE, type IndicatorKey } from '../features/indicatorKnowledge';
import type { IndicatorData } from '../types';

const { Text } = Typography;

const SERIES: Record<IndicatorKey, Array<[string, string]>> = {
  ma: [['MA5', 'ma5'], ['MA10', 'ma10'], ['MA20', 'ma20'], ['MA60', 'ma60']],
  macd: [['DIF', 'dif'], ['DEA', 'dea'], ['MACD', 'hist']],
  kdj: [['K', 'k'], ['D', 'd'], ['J', 'j']],
  rsi: [['RSI6', 'rsi6'], ['RSI12', 'rsi12'], ['RSI24', 'rsi24']],
};

function latestKnown(values: Array<number | null> | undefined): number | null {
  if (!values) return null;
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (value != null && Number.isFinite(value)) return value;
  }
  return null;
}

export function latestIndicatorValues(data: IndicatorData, key: IndicatorKey): Array<[string, string]> {
  const indicator = data.indicators[key] as Record<string, Array<number | null>> | undefined;
  return SERIES[key].map(([label, seriesKey]) => {
    const value = latestKnown(indicator?.[seriesKey]);
    return [label, value == null ? '未知' : value.toFixed(2)];
  });
}

export default function IndicatorGuide({ data, keys = INDICATOR_KEYS }: { data: IndicatorData; keys?: readonly IndicatorKey[] }) {
  const cutoff = data.days[data.days.length - 1] ?? '未知';

  return (
    <Card
      id="indicator-guides"
      size="small"
      title="指标怎么读"
      extra={<Space><Text type="secondary">截止 {cutoff}</Text><a href="#raw-indicators">查看原始指标</a></Space>}
      style={{ marginBottom: 12 }}
    >
      <Collapse
        size="small"
        items={keys.map((key) => {
          const guide = INDICATOR_KNOWLEDGE[key];
          const values = latestIndicatorValues(data, key);
          return {
            key,
            label: (
              <Space size={[6, 6]} wrap>
                <Text strong>{guide.title}</Text>
                {values.map(([label, value]) => <Tag key={label} bordered={false}>{label} {value}</Tag>)}
              </Space>
            ),
            children: (
              <div className="indicator-guide-content">
                <Descriptions column={{ xs: 1, md: 2 }} layout="vertical" size="small">
                  <Descriptions.Item label="用途">{guide.purpose}</Descriptions.Item>
                  <Descriptions.Item label="怎么读">{guide.reading}</Descriptions.Item>
                  <Descriptions.Item label="参数与公式">{guide.method}</Descriptions.Item>
                  <Descriptions.Item label="常见误区">{guide.pitfall}</Descriptions.Item>
                </Descriptions>
                <Link aria-label={`打开 ${guide.shortName} 知识主题`} to={`/knowledge?indicator=${key}`}>
                  打开知识主题
                </Link>
              </div>
            ),
          };
        })}
      />
    </Card>
  );
}
