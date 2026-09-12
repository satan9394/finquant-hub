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
import { LoadStateView, readStateOf } from './LoadFailureAlert';

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
  // VS29：**读取**失败与**动作**（确认/编辑/删除/导出）失败是两件事，必须分开：
  // 读取失败进三态视图（与"暂无研究记忆"互斥）；动作失败是另一条操作的结果，可以并存。
  // 修前两者共用一个 `error`，于是出现"同屏同时显示'读取失败'与'暂无研究记忆'"（互相否定）。
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  // VS29：是否成功读取过一次 —— "确实没有研究记忆"只在它为真时成立（readStateOf 的第 3 条）。
  const [resolved, setResolved] = useState(false);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchMemories(includeDeleted));
      // VS29 口径：**仅成功才清失败态**（与 Chat/Discussion 列表、Dashboard 同一种做法）。
      setResolved(true);
      setLoadFailed(false);
      setLoadError('');
    } catch (error: unknown) {
      // 失败不得伪装成"暂无研究记忆"：由三态视图统一呈现（失败文案 + 具体原因 + 重试）。
      setLoadFailed(true);
      setLoadError(error instanceof Error ? error.message : '');
    } finally {
      setLoading(false);
    }
  }, [includeDeleted]);

  useEffect(() => { void load(); }, [load]);

  const runAction = async (
    item: InvestmentMemory,
    action: 'confirm' | 'edit' | 'invalidate',
    content?: Record<string, unknown>,
  ) => {
    setBusyId(item.id);
    setActionError('');
    try {
      await actOnMemory(item.id, { action, ...(content ? { content } : {}) });
      setEditingId(null);
      await load();
    } catch {
      setActionError(t('memory.error.action'));
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
      setActionError(t('memory.error.invalidJson'));
    }
  };

  const remove = async (item: InvestmentMemory) => {
    setBusyId(item.id);
    setActionError('');
    try {
      await deleteMemory(item.id);
      await load();
    } catch {
      setActionError(t('memory.error.delete'));
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
      setActionError(t('memory.error.export'));
    }
  };

  // VS29：三态判据（优先级只在 readStateOf 里定义一次）。
  const memoryState = readStateOf({ failed: loadFailed, resolved, error: loadError, count: items.length });

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

      {/* VS29：动作失败与读取失败是两条路径，文案也分开（不会再和"暂无研究记忆"同屏互否）。 */}
      {actionError && <Paragraph type="danger" role="alert" style={{ marginTop: 16 }}>{actionError}</Paragraph>}
      {/* VS29：三态互斥由 LoadStateView 的一个 switch 保证 —— 左侧导航上"读取失败"和"暂无研究记忆"
          从此不可能同时出现。刷新在途时用 Spin 覆盖在已有内容上（内容不清空），不改变状态判据。 */}
      <Spin spinning={loading && memoryState.status === 'ready'}>
        <LoadStateView
          state={memoryState}
          failureMessage={t('memory.error.load')}
          onRetry={() => void load()}
          loadingText={t('memory.loading')}
          emptyContent={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('memory.empty')} />}
          retainedCount={items.length}
          showContentOnError
        >
        <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 20 }}>
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
        </LoadStateView>
      </Spin>
    </section>
  );
}
