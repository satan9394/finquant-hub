/* Models management page: provider cards + preset selector + health badges. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, AutoComplete, Card, Segmented, Switch, Table, Button, Modal, Form, Input, InputNumber,
  Popconfirm, message, Typography,
} from 'antd';
import { PlusOutlined, ApiOutlined, CheckCircleOutlined, DeleteOutlined, EditOutlined, SearchOutlined, StarOutlined } from '@ant-design/icons';
import apiClient from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import { presetBaseUrl, presetById } from '../features/modelPresets';
import ProviderCard from '../components/models/ProviderCard';
import ProviderPresetSelector from '../components/models/ProviderPresetSelector';
import { modelCredentialLabel } from '../components/models/providerLabels';
import {
  forgetProviderHealth, healthStatusOf, isProviderEnabled, readDisabledProviderIds, readProviderHealth,
  recordProviderHealth, setProviderEnabled, visibleProviders, filterProviders, type ProviderHealthMap,
} from '../components/models/providerState';
import { useModelStore } from '../store/modelStore';
import type { ModelConfig, ModelTestResult } from '../types';

const { Text } = Typography;

export { modelCredentialLabel };

type ViewMode = 'cards' | 'table';

export default function Models() {
  const { t } = useLanguage();
  const models = useModelStore((s) => s.models);
  const setModels = useModelStore((s) => s.setModels);

  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelConfig | null>(null);
  const [form] = Form.useForm();
  const [testLoading, setTestLoading] = useState<number | null>(null);
  const [modelOptions, setModelOptions] = useState<Array<{ value: string }>>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverMessage, setDiscoverMessage] = useState('');
  const [testResult, setTestResult] = useState<{ id: number; result: ModelTestResult } | null>(null);
  const [health, setHealth] = useState<ProviderHealthMap>({});
  const [disabledIds, setDisabledIds] = useState<number[]>([]);
  const [showDisabled, setShowDisabled] = useState(false);
  const [providerQuery, setProviderQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const selectedProvider = Form.useWatch<string>('provider', form);

  useEffect(() => {
    setHealth(readProviderHealth());
    setDisabledIds(readDisabledProviderIds());
  }, []);

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

  const listed = useMemo(
    () => filterProviders(visibleProviders(models, disabledIds, showDisabled), providerQuery),
    [models, disabledIds, showDisabled, providerQuery],
  );
  const hiddenCount = models.length - visibleProviders(models, disabledIds, false).length;

  const openModal = (model?: ModelConfig) => {
    form.resetFields();
    setModelOptions([]);
    setDiscoverMessage('');
    if (model) {
      setEditingModel(model);
      form.setFieldsValue(model);
    } else {
      setEditingModel(null);
      form.resetFields();
    }
    setModalOpen(true);
  };

  const fetchModels = async () => {
    await form.validateFields(['base_url']);
    setDiscoverLoading(true);
    setModelOptions([]);
    try {
      const { base_url, api_key, api_key_env } = form.getFieldsValue();
      const { data } = await apiClient.post('/models/discover', {
        base_url, api_key, api_key_env, provider: selectedProvider ?? 'openai', model_id: editingModel?.id,
      });
      setModelOptions(data.items.map((value: string) => ({ value })));
      setDiscoverMessage(data.message);
    } catch (error: any) {
      setDiscoverMessage(error.message);
    } finally {
      setDiscoverLoading(false);
    }
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
      setHealth(forgetProviderHealth(id));
      setDisabledIds(setProviderEnabled(id, true));
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
      const result = res.data as ModelTestResult;
      setTestResult({ id, result });
      setHealth(recordProviderHealth(id, {
        status: result.ok ? 'ok' : 'error',
        checkedAt: new Date().toISOString(),
        message: result.message,
        latencyMs: result.latency_ms,
      }));
      if (result.ok) message.success(result.message);
      else message.error(result.message);
    } catch (e: any) {
      const result: ModelTestResult = { ok: false, latency_ms: null, message: e.message };
      setTestResult({ id, result });
      setHealth(recordProviderHealth(id, {
        status: 'error',
        checkedAt: new Date().toISOString(),
        message: e.message,
        latencyMs: null,
      }));
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

  const handleToggleEnabled = (id: number, enabled: boolean) => {
    setDisabledIds(setProviderEnabled(id, enabled));
  };

  const renderCard = (record: ModelConfig) => (
    <ProviderCard
      model={record}
      entry={health[String(record.id)]}
      testing={testLoading === record.id}
      enabled={isProviderEnabled(record.id, disabledIds)}
      onEdit={() => openModal(record)}
      onTest={() => handleTest(record.id)}
      onSetDefault={() => handleSetDefault(record.id)}
      onDelete={() => handleDelete(record.id)}
      onToggleEnabled={(next) => handleToggleEnabled(record.id, next)}
    />
  );

  const columns = [
    { title: t('models.column.name'), dataIndex: 'name', key: 'name', render: (v: string, r: ModelConfig) => (
      <span>{v} {r.is_default === 1 && <span style={{ color: 'var(--fq-system-warning)' }}><StarOutlined /> {t('models.default')}</span>}</span>
    )},
    { title: t('models.column.provider'), dataIndex: 'provider', key: 'provider', width: 120 },
    { title: t('models.form.baseUrl'), dataIndex: 'base_url', key: 'base_url', ellipsis: true },
    { title: t('models.column.model'), dataIndex: 'model_name', key: 'model_name' },
    { title: t('models.column.credentials'), key: 'credentials', width: 160, render: (_: unknown, record: ModelConfig) => (
      <Text type={record.has_api_key ? undefined : 'danger'}>{modelCredentialLabel(record, t)}</Text>
    ) },
    { title: t('models.health.column'), key: 'health', width: 160, render: (_: unknown, record: ModelConfig) => (
      <Text type={healthStatusOf(health[String(record.id)]) === 'error' ? 'danger' : 'secondary'}>
        {t(`models.health.${healthStatusOf(health[String(record.id)])}`)}
      </Text>
    ) },
    { title: t('models.column.actions'), key: 'actions', width: 280, render: (_: unknown, record: ModelConfig) => (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <Button size="small" icon={<EditOutlined />} onClick={() => openModal(record)}>{t('models.action.edit')}</Button>
        <Button size="small" icon={<ApiOutlined />} loading={testLoading === record.id} onClick={() => handleTest(record.id)}>
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

  const cardColumns = [
    {
      key: 'card',
      render: (_: unknown, record: ModelConfig) => renderCard(record),
      onCell: () => ({ style: { padding: '0 0 10px' } }),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title={t('models.title')}
        extra={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Input
              allowClear
              size="small"
              style={{ width: 180 }}
              prefix={<SearchOutlined />}
              value={providerQuery}
              onChange={(event) => setProviderQuery(event.target.value)}
              placeholder={t('models.search.placeholder')}
              aria-label={t('models.search.placeholder')}
            />
            <Segmented
              size="small"
              value={viewMode}
              onChange={(value) => setViewMode(value as ViewMode)}
              options={[
                { label: t('models.view.cards'), value: 'cards' },
                { label: t('models.view.table'), value: 'table' },
              ]}
            />
            {hiddenCount > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Switch
                  size="small"
                  checked={showDisabled}
                  onChange={setShowDisabled}
                  aria-label={t('models.card.showDisabled')}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>{t('models.card.showDisabled')}</Text>
              </span>
            )}
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>{t('models.action.new')}</Button>
          </div>
        )}
      >
        {viewMode === 'cards' ? (
          <Table
            dataSource={listed}
            columns={cardColumns}
            rowKey="id"
            loading={loading}
            pagination={false}
            showHeader={false}
          />
        ) : (
          <Table dataSource={listed} columns={columns} rowKey="id" loading={loading} pagination={false} />
        )}

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
        width={640}
      >
        <Form form={form} layout="vertical" initialValues={{ provider: 'openai', temperature: 0.7, max_tokens: 4096 }}>
          <Form.Item name="name" label={t('models.column.name')} rules={[{ required: true, message: t('models.validation.name') }]}>
            <Input placeholder={t('models.placeholder.name')} />
          </Form.Item>
          <Form.Item name="provider" label={t('models.column.provider')} hidden>
            <Input />
          </Form.Item>
          <ProviderPresetSelector
            value={selectedProvider}
            onChange={(provider) => {
              form.setFieldValue('provider', provider);
              const baseUrl = presetBaseUrl(provider);
              if (baseUrl) form.setFieldValue('base_url', baseUrl);
              const defaultModel = presetById(provider)?.defaultModel;
              if (defaultModel) form.setFieldValue('model_name', defaultModel);
              setModelOptions([]);
            }}
          />
          <div
            role="note"
            style={{
              display: 'grid',
              gap: 4,
              marginTop: 12,
              padding: 10,
              border: '1px solid var(--fq-border)',
              borderRadius: 6,
              background: 'var(--fq-surface-2)',
            }}
          >
            <Text strong style={{ color: 'var(--fq-text-primary)' }}>
              {t(presetById(selectedProvider)?.protocol === 'anthropic'
                ? 'models.protocol.anthropic.title'
                : 'models.protocol.openai.title')}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t(presetById(selectedProvider)?.protocol === 'anthropic'
                ? 'models.protocol.anthropic.description'
                : 'models.protocol.openai.description')}
            </Text>
          </div>
          <Form.Item
            name="base_url"
            label={t('models.form.baseUrl')}
            extra={t('models.form.baseUrlHelp')}
            rules={[{ required: true }, { type: 'url' }]}
            style={{ marginTop: 16 }}
          >
            <Input placeholder="https://api.openai.com/v1" onChange={() => { setModelOptions([]); setDiscoverMessage(''); }} />
          </Form.Item>
          {presetById(selectedProvider) && (
            <div style={{ marginTop: -14, marginBottom: 12, fontSize: 12 }}>
              <a href={presetById(selectedProvider)?.docsUrl} target="_blank" rel="noreferrer">
                {t('models.preset.docs')}
              </a>
            </div>
          )}
          <Form.Item
            name="api_key"
            label={t('models.form.apiKey')}
            extra={t(presetById(selectedProvider)?.protocol === 'anthropic'
              ? 'models.anthropic.keyHint'
              : 'models.form.keyHelp')}
          >
            <Input.Password placeholder={t(presetById(selectedProvider)?.protocol === 'anthropic'
              ? 'models.anthropic.keyPlaceholder'
              : 'models.placeholder.apiKey')} />
          </Form.Item>
          <Button loading={discoverLoading} onClick={() => void fetchModels()}>{t('models.form.fetchModels')}</Button>
          {discoverMessage && <Alert style={{ marginTop: 8 }} type={modelOptions.length ? 'success' : 'warning'} message={discoverMessage} />}
          <Form.Item name="model_name" label={t('models.column.model')} rules={[{ required: true }]} style={{ marginTop: 12 }}>
            <AutoComplete options={modelOptions} placeholder={t('models.form.modelHelp')} filterOption={(input, option) => String(option?.value).toLowerCase().includes(input.toLowerCase())} />
          </Form.Item>
          <details><summary>{t('models.form.advanced')}</summary>
          <Form.Item name="api_key_env" label={t('models.form.apiKeyEnv')}>
            <Input placeholder={t('models.placeholder.apiKeyEnv')} />
          </Form.Item>
          <Form.Item name="temperature" label={t('models.form.temperature')}>
            <InputNumber min={0} max={2} step={0.1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="max_tokens" label={t('models.form.maxTokens')}>
            <InputNumber min={1} max={32768} style={{ width: '100%' }} />
          </Form.Item>
          </details>
        </Form>
      </Modal>
    </div>
  );
}
