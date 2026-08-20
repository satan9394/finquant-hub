import { Alert, Card, Descriptions } from 'antd';

import { explainBacktestFailure } from '../../features/backtest/interpretation';

export default function BacktestFailurePanel({ error, title = '回测未完成' }: { error: string; title?: string }) {
  const failure = explainBacktestFailure(error);
  return (
    <Card title={title} className="surface-card" style={{ marginTop: 18 }}>
      <Alert type="error" showIcon message={failure.category} description={failure.nextStep} />
      <Descriptions column={1} size="small" style={{ marginTop: 12 }}>
        <Descriptions.Item label="原始错误">{failure.raw}</Descriptions.Item>
      </Descriptions>
    </Card>
  );
}
