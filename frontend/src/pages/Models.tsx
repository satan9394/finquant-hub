/* Models management page. */
import { useEffect, useState, useCallback } from 'react';
import {
  Card, Table, Button, Modal, Form, Input, InputNumber, Select, Popconfirm, Tag, message, Typography,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ApiOutlined, CheckCircleOutlined, StarOutlined } from '@ant-design/icons';
import apiClient from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import { translate } from '../i18n';
import { useModelStore } from '../store/modelStore';
import type { ModelConfig, ModelTestResult } from '../types';

const { Text } = Typography;

type Translator = (key: string, values?: Record<string, string | number>) => string;

export function modelCredentialLabel(
  model: ModelConfig,
  t: Translator = (key, values) => translate('zh', key, values),
) {
  if (model.credential_source === 'stored') return t('models.credentials.stored');
  if (model.credential_source === 'environment') {
    return t('models.credentials.environment', { variable: model.api_key_env || '' });
  }
  if (model.api_key_env) return t('models.credentials.waiting', { variable: model.api_key_env });
  return t('models.credentials.missing');
}

export default function Models() {
  const { t } = useLanguage();
  const models = useModelStore((s) => s.models);
  const setModels = useModelStore((s) => s.setModels);

  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelConfig | null>(null);
  const [form] = Form.useForm();
  const [testLoading, setTestLoading] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; result: ModelTestResult } | null>(null);

  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/models');
      setModels(res.data.items);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [setModels]);

  useEffect(() => { loadModels(); }, [loadModels]);

  const openModal = (model?: ModelConfig) => {
    if (model) {
      setEditingModel(model);
      form.setFieldsValue(model);
    } else {
      setEditingModel(null);
      form.resetFields();
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      if (editingModel) {
        await apiClient.put(`/models/${editingModel.id}`, values);
        message.success(t('models.message.updated'));
      } else {
        await apiClient.post('/models', values);
        message.success(t('models.message.created'));
      }
      setModalOpen(false);
      loadModels();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiClient.delete(`/models/${id}`);
      message.success(t('models.message.deleted'));
      loadModels();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleTest = async (id: number) => {
    setTestLoading(id);
    setTestResult(null);
    try {
      const res = await apiClient.post(`/models/${id}/test`);
      setTestResult({ id, result: res.data });
      message.success(res.data.message);
    } catch (e: any) {
      setTestResult({ id, result: { ok: false, latency_ms: null, message: e.message } });
      message.error(e.message);
    } finally {
      setTestLoading(null);
    }
  };

  const handleSetDefault = async (id: number) => {
    try {
      await apiClient.post(`/models/${id}/set-default`);
      message.success(t('models.message.defaultSet'));
      loadModels();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const columns = [
    { title: t('models.column.name'), dataIndex: 'name', key: 'name', render: (v: string, r: ModelConfig) => (
      <span>{v} {r.is_default === 1 && <Tag color="gold" icon={<StarOutlined />}>{t('models.default')}</Tag>}</span>
    )},
    { title: t('models.column.provider'), dataIndex: 'provider', key: 'provider', width: 100 },
    { title: 'Endpoint', dataIndex: 'base_url', key: 'base_url', ellipsis: true },
    { title: t('models.column.model'), dataIndex: 'model_name', key: 'model_name' },
    { title: t('models.column.credentials'), key: 'credentials', width: 150, render: (_: unknown, record: ModelConfig) => (
      <Text type={record.has_api_key ? undefined : 'danger'}>
        {modelCredentialLabel(record, t)}
      </Text>
    ) },
    { title: 'Temperature', dataIndex: 'temperature', key: 'temperature', width: 110, render: (v: number) => v?.toFixed(1) },
    { title: t('models.column.actions'), key: 'actions', width: 280, render: (_: any, record: ModelConfig) => (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <Button size="small" icon={<EditOutlined />} onClick={() => openModal(record)}>{t('models.action.edit')}</Button>
        <Button
          size="small"
          icon={<ApiOutlined />}
          loading={testLoading === record.id}
          onClick={() => handleTest(record.id)}
        >
          {t('models.action.test')}
        </Button>
        {record.is_default !== 1 && (
          <Button size="small" icon={<StarOutlined />} onClick={() => handleSetDefault(record.id)}>{t('models.action.setDefault')}</Button>
        )}
        <Popconfirm title={t('models.confirmDelete')} onConfirm={() => handleDelete(record.id)}>
          <Button size="small" danger icon={<DeleteOutlined />}>{t('models.action.delete')}</Button>
        </Popconfirm>
      </div>
    )},
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title={t('models.title')}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>{t('models.action.new')}</Button>}
      >
        <Table
          dataSource={models}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
        />

        {testResult && (
          <div style={{ marginTop: 16, padding: 12, background: testResult.result.ok ? 'color-mix(in srgb, var(--fq-opportunity) 10%, var(--fq-surface-1))' : 'color-mix(in srgb, var(--fq-system-error) 10%, var(--fq-surface-1))', borderRadius: 4 }}>
            <Text strong>
              {testResult.result.ok ? <CheckCircleOutlined style={{ color: 'var(--fq-opportunity)' }} /> : <ApiOutlined style={{ color: 'var(--fq-system-error)' }} />}
              {' '}{t('models.testResult.title')}
            </Text>
            <div style={{ marginTop: 4, fontSize: 13 }}>
              <div>{testResult.result.message}</div>
              {testResult.result.latency_ms != null && (
                <div>{t('models.testResult.latency', { value: testResult.result.latency_ms })}</div>
              )}
              {testResult.result.reply && (
                <div>{t('models.testResult.reply', { value: testResult.result.reply })}</div>
              )}
            </div>
          </div>
        )}
      </Card>

      <Modal
        title={editingModel ? t('models.modal.editTitle') : t('models.modal.newTitle')}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText={t('models.action.save')}
        cancelText={t('models.action.cancel')}
        width={520}
      >
        <Form form={form} layout="vertical" initialValues={{ provider: 'openai', temperature: 0.7, max_tokens: 4096 }}>
          <Form.Item name="name" label={t('models.column.name')} rules={[{ required: true, message: t('models.validation.name') }]}>
            <Input placeholder={t('models.placeholder.name')} />
          </Form.Item>
          <Form.Item name="provider" label={t('models.column.provider')}>
            <Select options={[
              { label: t('models.provider.openai'), value: 'openai' },
              { label: t('models.provider.deepseek'), value: 'deepseek' },
              { label: t('models.provider.openrouter'), value: 'openrouter' },
              { label: t('models.provider.custom'), value: 'custom' },
            ]} />
          </Form.Item>
          <Form.Item name="base_url" label="Endpoint" rules={[{ required: true }]}>
            <Input placeholder="https://api.deepseek.com" />
          </Form.Item>
          <Form.Item name="model_name" label={t('models.column.model')} rules={[{ required: true }]}>
            <Input placeholder="deepseek-v4-flash" />
          </Form.Item>
          <Form.Item name="api_key" label={t('models.form.apiKey')}>
            <Input.Password placeholder={t('models.placeholder.apiKey')} />
          </Form.Item>
          <Form.Item name="api_key_env" label={t('models.form.apiKeyEnv')}>
            <Input placeholder={t('models.placeholder.apiKeyEnv')} />
          </Form.Item>
          <Form.Item name="temperature" label="Temperature">
            <InputNumber min={0} max={2} step={0.1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="max_tokens" label="Max Tokens">
            <InputNumber min={1} max={32768} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
