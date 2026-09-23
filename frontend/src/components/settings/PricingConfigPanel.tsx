import { Alert, Button, Card, Popconfirm, Space, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useState } from 'react';

import { useLanguage } from '../../i18n/LanguageContext';
import {
  createModelPricing,
  deleteModelPricing,
  listModelPricing,
  updateModelPricing,
  type ModelPricingInput,
  type ModelPricingItem,
} from '../../services/usageApi';
import PricingEditModal from './PricingEditModal';

interface PricingConfigPanelProps {
  /** 单价变更后通知父级重新拉取费用估算。 */
  onChanged?: () => void;
}

export default function PricingConfigPanel({ onChanged }: PricingConfigPanelProps) {
  const { t } = useLanguage();
  const [items, setItems] = useState<ModelPricingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ModelPricingItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await listModelPricing());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('settings.usage.pricing.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  const openEditor = (item: ModelPricingItem | null) => {
    setEditing(item);
    setModalOpen(true);
  };

  const submit = async (values: ModelPricingInput) => {
    setSaving(true);
    setError('');
    try {
      if (editing) await updateModelPricing(editing.id, values);
      else await createModelPricing(values);
      message.success(t(editing ? 'settings.usage.pricing.updated' : 'settings.usage.pricing.created'));
      setModalOpen(false);
      setEditing(null);
      await load();
      onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('settings.usage.pricing.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    setError('');
    try {
      await deleteModelPricing(id);
      setItems((current) => current.filter((item) => item.id !== id));
      message.success(t('settings.usage.pricing.deleted'));
      onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('settings.usage.pricing.deleteFailed'));
    }
  };

  const columns: ColumnsType<ModelPricingItem> = [
    { title: t('settings.usage.pricing.modelName'), dataIndex: 'model_name', render: (value: string) => <Typography.Text code>{value}</Typography.Text> },
    { title: t('settings.usage.pricing.inputPrice'), dataIndex: 'input_per_1m', align: 'right', render: (value: number) => value },
    { title: t('settings.usage.pricing.outputPrice'), dataIndex: 'output_per_1m', align: 'right', render: (value: number) => value },
    { title: t('settings.usage.pricing.currency'), dataIndex: 'currency', render: (value: string) => <Tag>{value}</Tag> },
    { title: t('settings.usage.pricing.updatedAt'), dataIndex: 'updated_at', render: (value: string) => (value ? value.slice(0, 19) : '-') },
    {
      title: t('settings.usage.pricing.actions'),
      key: 'actions',
      render: (_value, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditor(record)}>
            {t('settings.usage.pricing.edit')}
          </Button>
          <Popconfirm
            title={t('settings.usage.pricing.deleteConfirm', { model: record.model_name })}
            okText={t('settings.usage.pricing.delete')}
            cancelText={t('settings.usage.pricing.cancel')}
            onConfirm={() => void remove(record.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              {t('settings.usage.pricing.delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      size="small"
      title={t('settings.usage.pricing.title')}
      loading={loading}
      extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => openEditor(null)} data-testid="pricing-add">{t('settings.usage.pricing.add')}</Button>}
      data-testid="pricing-config-panel"
    >
      <Alert
        type="info"
        showIcon
        message={t('settings.usage.pricing.notice')}
        style={{ marginBottom: 12 }}
      />
      {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} /> : null}
      {items.length === 0 && !loading ? (
        <Alert type="warning" showIcon message={t('settings.usage.pricing.empty')} data-testid="pricing-empty" />
      ) : (
        <Table<ModelPricingItem>
          size="small"
          rowKey="id"
          dataSource={items}
          columns={columns}
          pagination={false}
          scroll={{ x: '100%' }}
          data-testid="pricing-table"
        />
      )}
      <PricingEditModal
        open={modalOpen}
        item={editing}
        saving={saving}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
        onSubmit={(values) => void submit(values)}
      />
    </Card>
  );
}
