import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Form, InputNumber, Row, Skeleton, Space, Switch, Typography, message } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import {
  getSystemSettings,
  updateSystemSettings,
  type SystemSettings,
} from '../../services/settingsApi';


export default function SystemSettingsPanel() {
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
      setError(cause instanceof Error ? cause.message : '系统配置加载失败');
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
      message.success('系统配置已保存并应用');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '系统配置保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title="盘后任务调度"
      extra={<Typography.Text type="secondary">FinQuant Hub {version}</Typography.Text>}
      data-testid="system-settings-panel"
    >
      {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null}
      <Alert
        type="info"
        showIcon
        message="这里只开放非敏感运行参数；API Key 和环境变量值不会返回浏览器。"
        style={{ marginBottom: 18 }}
      />
      {loading ? <Skeleton active paragraph={{ rows: 5 }} /> : (
        <Form form={form} layout="vertical">
          <Form.Item name="scheduler_enabled" label="启用每日盘后任务" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="scheduler_hour" label="执行小时（本地时间）" rules={[{ required: true }]}>
                <InputNumber min={0} max={23} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="scheduler_minute" label="执行分钟" rules={[{ required: true }]}>
                <InputNumber min={0} max={59} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="scheduler_concurrency" label="最大并发研究数" rules={[{ required: true }]}>
                <InputNumber min={1} max={20} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="scheduler_max_targets" label="单轮最大标的数" rules={[{ required: true }]}>
                <InputNumber min={1} max={1000} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Space>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void save()}>
              保存并应用
            </Button>
            <Button onClick={() => void load()}>恢复当前值</Button>
          </Space>
        </Form>
      )}
    </Card>
  );
}
