import { Button, Card, Col, Row, Space, Tag, Typography } from 'antd';

import {
  STRATEGY_GOALS, STRATEGY_PRESETS, type StrategyGoal, type StrategyPresetKey,
} from '../../features/backtest/presets';
import { useLanguage } from '../../i18n/LanguageContext';

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
  const { t } = useLanguage();
  return (
    <Card title={t('strategy.setup.title')} className="surface-card" style={{ marginBottom: 18 }}>
      <Row gutter={[12, 12]}>
        {STRATEGY_GOALS.map((item) => {
          const title = t(`strategy.goal.${item.key}.title`);
          return <Col xs={24} md={8} key={item.key}>
            <Card size="small" style={{ height: '100%', borderColor: goal === item.key ? 'var(--fq-ai-primary)' : undefined }}>
              <Space wrap><Text strong>{title}</Text><Tag color={item.available ? 'green' : 'default'}>{t(item.available ? 'strategy.setup.available' : 'strategy.setup.unavailable')}</Tag></Space>
              <Paragraph type="secondary" style={{ minHeight: 44, margin: '8px 0' }}>{t(`strategy.goal.${item.key}.description`)}</Paragraph>
              <Button
                block
                type={goal === item.key ? 'primary' : 'default'}
                disabled={!item.available}
                aria-label={t('strategy.setup.selectAria', { title })}
                onClick={() => {
                  onGoalChange(item.key);
                  if (item.defaultPreset) onPresetChange(item.defaultPreset);
                }}
              >
                {goal === item.key ? t('strategy.setup.currentGoal') : t('strategy.setup.selectGoal', { title })}
              </Button>
            </Card>
          </Col>;
        })}
      </Row>

      <Text strong style={{ display: 'block', margin: '18px 0 10px' }}>{t('strategy.setup.presets')}</Text>
      <Row gutter={[12, 12]}>
        {(Object.entries(STRATEGY_PRESETS) as Array<[StrategyPresetKey, typeof STRATEGY_PRESETS[StrategyPresetKey]]>).map(([key]) => {
          const label = t(`strategy.preset.${key}.label`);
          return <Col xs={24} md={8} key={key}>
            <Card size="small" style={{ height: '100%', borderColor: preset === key ? 'var(--fq-ai-primary)' : undefined }}>
              <Space wrap><Text strong>{label}</Text><Tag>{t(`strategy.preset.${key}.parameters`)}</Tag></Space>
              <Paragraph style={{ margin: '8px 0 4px' }}>{t(`strategy.preset.${key}.purpose`)}</Paragraph>
              <Text type="secondary">{t('strategy.setup.tradeoff', { value: t(`strategy.preset.${key}.tradeoff`) })}</Text>
              <Button block type={preset === key ? 'primary' : 'default'} style={{ marginTop: 10 }} onClick={() => onPresetChange(key)}>
                {preset === key ? t('strategy.setup.currentPreset') : t('strategy.setup.selectPreset', { label })}
              </Button>
            </Card>
          </Col>;
        })}
      </Row>
      <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>{t('strategy.setup.notice')}</Text>
    </Card>
  );
}
