import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Select, Skeleton, Space, Typography, message } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import apiClient from '../../services/api';
import { useLanguage } from '../../i18n/LanguageContext';

type Provider = 'akshare' | 'tushare' | 'yahoo';

interface SourceStatus {
  priorities: { fundamentals: Provider[] };
}

interface SourceForm {
  first: Provider;
  second: Provider;
  third: Provider;
}

export default function FundamentalsSourcePanel() {
  const { t } = useLanguage();
  const options = [
    { value: 'akshare', label: t('settings.fundamentals.akshare') },
    { value: 'tushare', label: t('settings.fundamentals.tushare') },
    { value: 'yahoo', label: t('settings.fundamentals.yahoo') },
  ];
  const [form] = Form.useForm<SourceForm>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiClient.get<SourceStatus>('/market/sources');
      const [first, second, third] = response.data.priorities.fundamentals;
      form.setFieldsValue({ first, second, third });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('settings.fundamentals.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    let values: SourceForm;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const priority = [values.first, values.second, values.third];
    if (new Set(priority).size !== priority.length) {
      setError(t('settings.fundamentals.unique'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiClient.patch('/market/sources', { fundamentals: priority });
      message.success(t('settings.fundamentals.saved'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('settings.fundamentals.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title={t('settings.fundamentals.title')} data-testid="fundamentals-source-panel">
      {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null}
      <Alert
        type="info"
        showIcon
        message={t('settings.fundamentals.notice')}
        style={{ marginBottom: 18 }}
      />
      {loading ? <Skeleton active paragraph={{ rows: 3 }} /> : (
        <Form form={form} layout="vertical">
          {(['first', 'second', 'third'] as const).map((name, index) => (
            <Form.Item key={name} name={name} label={t('settings.fundamentals.priority', { value: index + 1 })} rules={[{ required: true }]}>
              <Select options={options} />
            </Form.Item>
          ))}
          <Space>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void save()}>
              {t('settings.fundamentals.save')}
            </Button>
            <Button onClick={() => void load()}>{t('settings.restore')}</Button>
          </Space>
          <Typography.Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
            {t('settings.fundamentals.description')}
          </Typography.Paragraph>
        </Form>
      )}
    </Card>
  );
}
