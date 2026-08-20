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

const { Paragraph, Text, Title } = Typography;

const statusColor: Record<InvestmentMemory['status'], string> = {
  candidate: 'gold',
  confirmed: 'green',
  superseded: 'default',
  invalidated: 'red',
  deleted: 'default',
};

const statusLabel: Record<InvestmentMemory['status'], string> = {
  candidate: '待确认',
  confirmed: '已确认',
  superseded: '已被取代',
  invalidated: '已作废',
  deleted: '已删除',
};

export default function MemoryManager() {
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
      setError('记忆读取失败，请稍后重试。');
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
    setError('');
    try {
      await actOnMemory(item.id, { action, ...(content ? { content } : {}) });
      setEditingId(null);
      await load();
    } catch {
      setError('操作失败；记录状态或 evidence 约束可能已变化。');
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
      setError('编辑内容必须是有效的 JSON 对象。');
    }
  };

  const remove = async (item: InvestmentMemory) => {
    setBusyId(item.id);
    setError('');
    try {
      await deleteMemory(item.id);
      await load();
    } catch {
      setError('删除失败；仅支持当前用户记录的单条 soft delete。');
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
      setError('导出失败，请稍后重试。');
    }
  };

  return (
    <section aria-labelledby="memory-manager-title">
      <Flex justify="space-between" align="start" gap={16} wrap>
        <div>
          <Text className="eyebrow">INVESTMENT MEMORY · USER CONTROLLED</Text>
          <Title id="memory-manager-title" level={4} style={{ margin: '4px 0' }}>我的研究记忆</Title>
          <Text type="secondary">AI 内容只会进入待确认状态；确认、作废与删除均由你显式操作。</Text>
        </div>
        <Space wrap>
          <Button onClick={() => setIncludeDeleted((value) => !value)}>
            {includeDeleted ? '隐藏已删除' : '查看已删除'}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
          <Button icon={<DownloadOutlined />} onClick={() => void download()}>导出 JSON</Button>
        </Space>
      </Flex>

      {error && <Paragraph type="danger" role="alert" style={{ marginTop: 16 }}>{error}</Paragraph>}
      <Spin spinning={loading}>
        <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 20 }}>
          {!loading && items.length === 0 && <Empty description="暂无研究记忆" />}
          {items.map((item) => (
            <Card key={item.id} size="small" title={`${item.subject_id} · ${item.memory_type}`}>
              <Space wrap>
                <Tag color={statusColor[item.status]}>{statusLabel[item.status]}</Tag>
                <Tag>{item.information_kind}</Tag>
                <Tag>{item.source_kind}</Tag>
                {item.quality_flags.map((flag) => <Tag key={flag} color="orange">{flag}</Tag>)}
              </Space>
              <Paragraph style={{ margin: '12px 0 8px', whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(item.content, null, 2)}
              </Paragraph>
              <Text type="secondary">
                来源：{item.evidence_id ?? item.source_id ?? 'UNKNOWN'} · 观察时间：{item.observed_at ?? 'UNKNOWN'}
              </Text>
              {editingId === item.id && (
                <Input.TextArea
                  aria-label={`编辑记忆 ${item.id}`}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  autoSize={{ minRows: 3, maxRows: 10 }}
                  style={{ marginTop: 12 }}
                />
              )}
              <Flex gap={8} wrap style={{ marginTop: 12 }}>
                {item.status === 'candidate' && (
                  <Button type="primary" loading={busyId === item.id} onClick={() => void runAction(item, 'confirm')}>
                    确认
                  </Button>
                )}
                {item.information_kind !== 'FACT' && !['superseded', 'deleted'].includes(item.status) && (
                  editingId === item.id ? (
                    <>
                      <Button loading={busyId === item.id} onClick={() => void saveEdit(item)}>保存为新版本</Button>
                      <Button onClick={() => setEditingId(null)}>取消</Button>
                    </>
                  ) : (
                    <Button onClick={() => { setEditingId(item.id); setDraft(JSON.stringify(item.content, null, 2)); }}>
                      编辑
                    </Button>
                  )
                )}
                {!['invalidated', 'superseded', 'deleted'].includes(item.status) && (
                  <Button danger onClick={() => void runAction(item, 'invalidate')}>作废</Button>
                )}
                {item.status !== 'deleted' && (
                  <Popconfirm
                    title="仅 soft-delete 这一条记忆，历史引用不会级联删除。"
                    onConfirm={() => void remove(item)}
                  >
                    <Button danger loading={busyId === item.id}>删除</Button>
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
