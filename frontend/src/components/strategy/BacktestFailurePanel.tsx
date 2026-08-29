import { Alert, Card, Descriptions } from 'antd';

import { explainBacktestFailure } from '../../features/backtest/interpretation';
import { useLanguage } from '../../i18n/LanguageContext';

export default function BacktestFailurePanel({ error, title }: { error: string; title?: string }) {
  const { t } = useLanguage();
  const failure = explainBacktestFailure(error, t);
  return (
    <Card title={title ?? t('strategy.failure.defaultTitle')} className="surface-card" style={{ marginTop: 18 }}>
      <Alert type="error" showIcon message={failure.category} description={failure.nextStep} />
      <Descriptions column={1} size="small" style={{ marginTop: 12 }}>
        <Descriptions.Item label={t('strategy.failure.raw')}>{failure.raw}</Descriptions.Item>
      </Descriptions>
    </Card>
  );
}
