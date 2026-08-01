import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Select, Skeleton, Space, Typography, message } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import apiClient from '../../services/api';

type Provider = 'akshare' | 'tushare' | 'yahoo';

interface SourceStatus {
  priorities: { fundamentals: Provider[] };
}

interface SourceForm {
  first: Provider;
  second: Provider;
  third: Provider;
}

const OPTIONS = [
  { value: 'akshare', label: 'AkShare（无需凭据）' },
  { value: 'tushare', label: 'Tushare（需 TUSHARE_TOKEN）' },
  { value: 'yahoo', label: 'Yahoo（全球兜底）' },
];

export default function FundamentalsSourcePanel() {
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
      setError(cause instanceof Error ? cause.message : '基本面数据源配置加载失败');
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
      setError('三个优先级必须各选择一个不同的数据源');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiClient.patch('/market/sources', { fundamentals: priority });
      message.success('基本面数据源优先级已保存');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '基本面数据源配置保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="A 股基本面数据源" data-testid="fundamentals-source-panel">
      {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null}
      <Alert
        type="info"
        showIcon
        message="默认 AkShare → Tushare → Yahoo。Tushare 未配置 token 时会自动跳过；Yahoo 降级数据会保留存疑标记。"
        style={{ marginBottom: 18 }}
      />
      {loading ? <Skeleton active paragraph={{ rows: 3 }} /> : (
        <Form form={form} layout="vertical">
          {(['first', 'second', 'third'] as const).map((name, index) => (
            <Form.Item key={name} name={name} label={`优先级 ${index + 1}`} rules={[{ required: true }]}>
              <Select options={OPTIONS} />
            </Form.Item>
          ))}
          <Space>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void save()}>
              保存优先级
            </Button>
            <Button onClick={() => void load()}>恢复当前值</Button>
          </Space>
          <Typography.Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
            数据源顺序只影响 A 股；港股和美股继续使用 Yahoo。凭据仅从服务端环境变量读取，不会返回浏览器。
          </Typography.Paragraph>
        </Form>
      )}
    </Card>
  );
}
