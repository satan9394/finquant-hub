import { useState } from 'react';
import { Alert, Button, Card, Checkbox, Radio, Space, Typography, message } from 'antd';

import { INDICATOR_KEYS, INDICATOR_KNOWLEDGE, type IndicatorKey } from '../../features/indicatorKnowledge';
import {
  readProfessionalPreferences,
  resetProfessionalPreferences,
  saveProfessionalPreferences,
  type LayoutDensity,
} from '../../features/professionalPreferences';

const { Paragraph, Text } = Typography;

export default function ProfessionalPreferencesPanel() {
  const initial = readProfessionalPreferences();
  const [indicatorKeys, setIndicatorKeys] = useState<IndicatorKey[]>(initial.indicatorKeys);
  const [layoutDensity, setLayoutDensity] = useState<LayoutDensity>(initial.layoutDensity);
  const [alphaTemplateId, setAlphaTemplateId] = useState<string | null>(initial.alphaTemplateId);

  const save = () => {
    if (!indicatorKeys.length) {
      message.warning('至少保留一个常用指标');
      return;
    }
    const saved = saveProfessionalPreferences({ indicatorKeys, layoutDensity, alphaTemplateId });
    setIndicatorKeys(saved.indicatorKeys);
    setLayoutDensity(saved.layoutDensity);
    setAlphaTemplateId(saved.alphaTemplateId);
    message.success('专业偏好已保存在本机');
  };

  const reset = () => {
    const restored = resetProfessionalPreferences();
    setIndicatorKeys(restored.indicatorKeys);
    setLayoutDensity(restored.layoutDensity);
    setAlphaTemplateId(restored.alphaTemplateId);
    message.success('已恢复新手默认值');
  };

  return (
    <Card title="专业工作台偏好">
      <Alert
        type="info"
        showIcon
        message="只改变本机展示与启动模板"
        description="不会改变指标算法、行情来源、复权、期间、成本或基准；新用户仍使用舒适密度和全部四类指标。"
        style={{ marginBottom: 16 }}
      />

      <Paragraph strong>常用指标</Paragraph>
      <Checkbox.Group
        aria-label="常用指标"
        value={indicatorKeys}
        options={INDICATOR_KEYS.map((key) => ({ label: INDICATOR_KNOWLEDGE[key].shortName, value: key }))}
        onChange={(values) => setIndicatorKeys(values as IndicatorKey[])}
      />

      <Paragraph strong style={{ marginTop: 18 }}>布局密度</Paragraph>
      <Radio.Group
        aria-label="布局密度"
        value={layoutDensity}
        onChange={(event) => setLayoutDensity(event.target.value as LayoutDensity)}
        options={[
          { label: '舒适（默认）', value: 'comfortable' },
          { label: '紧凑', value: 'compact' },
        ]}
      />

      <Paragraph style={{ marginTop: 18, marginBottom: 6 }}><Text strong>常用研究模板</Text></Paragraph>
      <Text type="secondary">
        {alphaTemplateId ? `Alpha 真实目录模板：${alphaTemplateId}` : '未设置；请在 Alpha 因子研究页选择真实模板后显式保存。'}
      </Text>

      <Space wrap style={{ marginTop: 18, width: '100%' }}>
        <Button type="primary" onClick={save}>保存专业偏好</Button>
        <Button onClick={reset}>恢复默认</Button>
      </Space>
    </Card>
  );
}
