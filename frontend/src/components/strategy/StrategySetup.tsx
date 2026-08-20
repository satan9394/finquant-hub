import { Button, Card, Col, Row, Space, Tag, Typography } from 'antd';

import {
  STRATEGY_GOALS, STRATEGY_PRESETS, type StrategyGoal, type StrategyPresetKey,
} from '../../features/backtest/presets';

const { Paragraph, Text } = Typography;

export default function StrategySetup({
  goal,
  preset,
  onGoalChange,
  onPresetChange,
}: {
  goal: StrategyGoal;
  preset: StrategyPresetKey;
  onGoalChange: (goal: StrategyGoal) => void;
  onPresetChange: (preset: StrategyPresetKey) => void;
}) {
  return (
    <Card title="1. 选择策略目标与预设" className="surface-card" style={{ marginBottom: 18 }}>
      <Row gutter={[12, 12]}>
        {STRATEGY_GOALS.map((item) => (
          <Col xs={24} md={8} key={item.key}>
            <Card size="small" style={{ height: '100%', borderColor: goal === item.key ? '#1677ff' : undefined }}>
              <Space wrap><Text strong>{item.title}</Text><Tag color={item.available ? 'green' : 'default'}>{item.available ? '可运行' : '暂不可用'}</Tag></Space>
              <Paragraph type="secondary" style={{ minHeight: 44, margin: '8px 0' }}>{item.description}</Paragraph>
              <Button
                block
                type={goal === item.key ? 'primary' : 'default'}
                disabled={!item.available}
                aria-label={`选择${item.title}`}
                onClick={() => {
                  onGoalChange(item.key);
                  if (item.defaultPreset) onPresetChange(item.defaultPreset);
                }}
              >
                {goal === item.key ? '当前目标' : `选择${item.title}`}
              </Button>
            </Card>
          </Col>
        ))}
      </Row>

      <Text strong style={{ display: 'block', margin: '18px 0 10px' }}>可执行双均线预设</Text>
      <Row gutter={[12, 12]}>
        {(Object.entries(STRATEGY_PRESETS) as Array<[StrategyPresetKey, typeof STRATEGY_PRESETS[StrategyPresetKey]]>).map(([key, item]) => (
          <Col xs={24} md={8} key={key}>
            <Card size="small" style={{ height: '100%', borderColor: preset === key ? '#1677ff' : undefined }}>
              <Space wrap><Text strong>{item.label}</Text><Tag>{item.parameters}</Tag></Space>
              <Paragraph style={{ margin: '8px 0 4px' }}>{item.purpose}</Paragraph>
              <Text type="secondary">主要取舍：{item.tradeoff}</Text>
              <Button block type={preset === key ? 'primary' : 'default'} style={{ marginTop: 10 }} onClick={() => onPresetChange(key)}>
                {preset === key ? '当前预设' : `选择${item.label}预设`}
              </Button>
            </Card>
          </Col>
        ))}
      </Row>
      <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>选择只更新本地表单；点击页面主操作后才提交回测。</Text>
    </Card>
  );
}
