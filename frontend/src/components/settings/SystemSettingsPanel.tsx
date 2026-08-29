import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Form, InputNumber, Row, Skeleton, Space, Switch, Typography, message } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import {
  getSystemSettings,
  updateSystemSettings,
  type SystemSettings,
} from '../../services/settingsApi';
import { useLanguage } from '../../i18n/LanguageContext';


export default function SystemSettingsPanel() {
  const { t } = useLanguage();
  const [form] = Form.useForm<SystemSettings>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getSystemSettings();
      form.setFieldsValue(response.settings);
      setVersion(response.metadata.app_version);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('settings.system.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    let values: SystemSettings;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await updateSystemSettings(values);
      form.setFieldsValue(response.settings);
      message.success(t('settings.system.saved'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('settings.system.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title={t('settings.system.title')}
      extra={<Typography.Text type="secondary">FinQuant Hub {version}</Typography.Text>}
      data-testid="system-settings-panel"
    >
      {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null}
      <Alert
        type="info"
        showIcon
        message={t('settings.system.notice')}
        style={{ marginBottom: 18 }}
      />
      {loading ? <Skeleton active paragraph={{ rows: 5 }} /> : (
        <Form form={form} layout="vertical">
          <Form.Item name="scheduler_enabled" label={t('settings.system.enableDaily')} valuePropName="checked">
            <Switch checkedChildren={t('settings.system.enabled')} unCheckedChildren={t('settings.system.disabled')} />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="scheduler_hour" label={t('settings.system.hour')} rules={[{ required: true }]}>
                <InputNumber min={0} max={23} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="scheduler_minute" label={t('settings.system.minute')} rules={[{ required: true }]}>
                <InputNumber min={0} max={59} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="scheduler_concurrency" label={t('settings.system.concurrency')} rules={[{ required: true }]}>
                <InputNumber min={1} max={20} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="scheduler_max_targets" label={t('settings.system.maxTargets')} rules={[{ required: true }]}>
                <InputNumber min={1} max={1000} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Space>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void save()}>
              {t('settings.system.save')}
            </Button>
            <Button onClick={() => void load()}>{t('settings.restore')}</Button>
          </Space>
        </Form>
      )}
    </Card>
  );
}
