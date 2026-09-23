import { useState } from 'react';
import { Alert, Button, Card, Checkbox, Radio, Space, Typography, message } from 'antd';

import { INDICATOR_KEYS, INDICATOR_KNOWLEDGE, type IndicatorKey } from '../../features/indicatorKnowledge';
import {
  readProfessionalPreferences,
  resetProfessionalPreferences,
  saveProfessionalPreferences,
  type LayoutDensity,
} from '../../features/professionalPreferences';
import { useLanguage } from '../../i18n/LanguageContext';

const { Paragraph, Text } = Typography;

export default function ProfessionalPreferencesPanel() {
  const { t } = useLanguage();
  const initial = readProfessionalPreferences();
  const [indicatorKeys, setIndicatorKeys] = useState<IndicatorKey[]>(initial.indicatorKeys);
  const [layoutDensity, setLayoutDensity] = useState<LayoutDensity>(initial.layoutDensity);
  const [alphaTemplateId, setAlphaTemplateId] = useState<string | null>(initial.alphaTemplateId);

  const save = () => {
    if (!indicatorKeys.length) {
      message.warning(t('settings.preferences.oneRequired'));
      return;
    }
    const saved = saveProfessionalPreferences({ indicatorKeys, layoutDensity, alphaTemplateId });
    setIndicatorKeys(saved.indicatorKeys);
    setLayoutDensity(saved.layoutDensity);
    setAlphaTemplateId(saved.alphaTemplateId);
    message.success(t('settings.preferences.saved'));
  };

  const reset = () => {
    const restored = resetProfessionalPreferences();
    setIndicatorKeys(restored.indicatorKeys);
    setLayoutDensity(restored.layoutDensity);
    setAlphaTemplateId(restored.alphaTemplateId);
    message.success(t('settings.preferences.resetDone'));
  };

  return (
    <Card title={t('settings.preferences.title')}>
      <Alert
        type="info"
        showIcon
        message={t('settings.preferences.notice')}
        description={t('settings.preferences.noticeDescription')}
        style={{ marginBottom: 16 }}
      />

      <Paragraph strong>{t('settings.preferences.indicators')}</Paragraph>
      <Checkbox.Group
        aria-label={t('settings.preferences.indicators')}
        value={indicatorKeys}
        options={INDICATOR_KEYS.map((key) => ({ label: INDICATOR_KNOWLEDGE[key].shortName, value: key }))}
        onChange={(values) => setIndicatorKeys(values as IndicatorKey[])}
      />

      <Paragraph strong style={{ marginTop: 18 }}>{t('settings.preferences.density')}</Paragraph>
      <Radio.Group
        aria-label={t('settings.preferences.density')}
        value={layoutDensity}
        onChange={(event) => setLayoutDensity(event.target.value as LayoutDensity)}
        options={[
          { label: t('settings.preferences.comfortable'), value: 'comfortable' },
          { label: t('settings.preferences.compact'), value: 'compact' },
        ]}
      />

      <Paragraph style={{ marginTop: 18, marginBottom: 6 }}><Text strong>{t('settings.preferences.template')}</Text></Paragraph>
      <Text type="secondary">
        {alphaTemplateId ? t('settings.preferences.templateValue', { id: alphaTemplateId }) : t('settings.preferences.noTemplate')}
      </Text>

      <Space wrap style={{ marginTop: 18, width: '100%' }}>
        <Button type="primary" onClick={save}>{t('settings.preferences.save')}</Button>
        <Button onClick={reset}>{t('settings.preferences.reset')}</Button>
      </Space>
    </Card>
  );
}
