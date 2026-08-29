import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Empty, Flex, Input, Popconfirm, Space, Spin, Tag, Typography } from 'antd';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  actOnMemory,
  deleteMemory,
  exportMemories,
  fetchMemories,
  type InvestmentMemory,
} from '../services/researchApi';
import { useLanguage } from '../i18n/LanguageContext';

const { Paragraph, Text, Title } = Typography;

const statusColor: Record<InvestmentMemory['status'], string> = {
  candidate: 'gold',
  confirmed: 'green',
  superseded: 'default',
  invalidated: 'red',
  deleted: 'default',
};

export default function MemoryManager() {
  const { t } = useLanguage();
  const [items, setItems] = useState<InvestmentMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await fetchMemories(includeDeleted));
    } catch {
      setError(t('memory.error.load'));
    } finally {
      setLoading(false);
    }
  }, [includeDeleted, t]);

  useEffect(() => { void load(); }, [load]);

  const runAction = async (
    item: InvestmentMemory,
    action: 'confirm' | 'edit' | 'invalidate',
    content?: Record<string, unknown>,
  ) => {
    setBusyId(item.id);
    setError('');
    try {
      await actOnMemory(item.id, { action, ...(content ? { content } : {}) });
      setEditingId(null);
      await load();
    } catch {
      setError(t('memory.error.action'));
    } finally {
      setBusyId(null);
    }
  };

  const saveEdit = async (item: InvestmentMemory) => {
    try {
      const parsed = JSON.parse(draft);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object required');
      await runAction(item, 'edit', parsed as Record<string, unknown>);
    } catch {
      setError(t('memory.error.invalidJson'));
    }
  };

  const remove = async (item: InvestmentMemory) => {
    setBusyId(item.id);
    setError('');
    try {
      await deleteMemory(item.id);
      await load();
    } catch {
      setError(t('memory.error.delete'));
    } finally {
      setBusyId(null);
    }
  };

  const download = async () => {
    try {
      const payload = await exportMemories();
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'finquant-investment-memory.json';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(t('memory.error.export'));
    }
  };

  return (
    <section aria-labelledby="memory-manager-title">
      <Flex justify="space-between" align="start" gap={16} wrap>
        <div>
          <Text className="eyebrow">{t('memory.eyebrow')}</Text>
          <Title id="memory-manager-title" level={4} style={{ margin: '4px 0' }}>{t('memory.title')}</Title>
          <Text type="secondary">{t('memory.subtitle')}</Text>
        </div>
        <Space wrap>
          <Button onClick={() => setIncludeDeleted((value) => !value)}>
            {includeDeleted ? t('memory.hideDeleted') : t('memory.showDeleted')}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>{t('memory.refresh')}</Button>
          <Button icon={<DownloadOutlined />} onClick={() => void download()}>{t('memory.export')}</Button>
        </Space>
      </Flex>

      {error && <Paragraph type="danger" role="alert" style={{ marginTop: 16 }}>{error}</Paragraph>}
      <Spin spinning={loading}>
        <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 20 }}>
          {!loading && items.length === 0 && <Empty description={t('memory.empty')} />}
          {items.map((item) => (
            <Card key={item.id} size="small" title={`${item.subject_id} · ${item.memory_type}`}>
              <Space wrap>
                <Tag color={statusColor[item.status]}>{t(`memory.status.${item.status}`)}</Tag>
                <Tag>{item.information_kind}</Tag>
                <Tag>{item.source_kind}</Tag>
                {item.quality_flags.map((flag) => <Tag key={flag} color="orange">{flag}</Tag>)}
              </Space>
              <Paragraph style={{ margin: '12px 0 8px', whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(item.content, null, 2)}
              </Paragraph>
              <Text type="secondary">
                {t('memory.provenance', { source: item.evidence_id ?? item.source_id ?? 'UNKNOWN', observedAt: item.observed_at ?? 'UNKNOWN' })}
              </Text>
              {editingId === item.id && (
                <Input.TextArea
                  aria-label={t('memory.editAria', { id: item.id })}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  autoSize={{ minRows: 3, maxRows: 10 }}
                  style={{ marginTop: 12 }}
                />
              )}
              <Flex gap={8} wrap style={{ marginTop: 12 }}>
                {item.status === 'candidate' && (
                  <Button type="primary" loading={busyId === item.id} onClick={() => void runAction(item, 'confirm')}>
                    {t('memory.confirm')}
                  </Button>
                )}
                {item.information_kind !== 'FACT' && !['superseded', 'deleted'].includes(item.status) && (
                  editingId === item.id ? (
                    <>
                      <Button loading={busyId === item.id} onClick={() => void saveEdit(item)}>{t('memory.saveVersion')}</Button>
                      <Button onClick={() => setEditingId(null)}>{t('memory.cancel')}</Button>
                    </>
                  ) : (
                    <Button onClick={() => { setEditingId(item.id); setDraft(JSON.stringify(item.content, null, 2)); }}>
                      {t('memory.edit')}
                    </Button>
                  )
                )}
                {!['invalidated', 'superseded', 'deleted'].includes(item.status) && (
                  <Button danger onClick={() => void runAction(item, 'invalidate')}>{t('memory.invalidate')}</Button>
                )}
                {item.status !== 'deleted' && (
                  <Popconfirm
                    title={t('memory.deleteConfirm')}
                    onConfirm={() => void remove(item)}
                  >
                    <Button danger loading={busyId === item.id}>{t('memory.delete')}</Button>
                  </Popconfirm>
                )}
              </Flex>
            </Card>
          ))}
        </Space>
      </Spin>
    </section>
  );
}
