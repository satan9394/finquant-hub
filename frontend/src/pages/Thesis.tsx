import { useCallback, useEffect, useState } from 'react';
import {
  Button, Card, Col, Empty, Form, Input, List, Modal, Row, Select, Space, Statistic, Tag, Typography, message,
} from 'antd';
import { EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';

import apiClient from '../services/api';


const { Paragraph, Text, Title } = Typography;

type ClaimStatus = 'holding' | 'confirmed' | 'violated' | 'unknown';
type ThesisStatus = 'open' | 'closed' | 'invalidated';

interface ThesisClaim {
  id: number;
  claim: string;
  kind: 'manual' | 'price' | 'position' | 'fundamental' | 'report';
  status: ClaimStatus;
  note: string;
  checked_at?: string | null;
}

interface ThesisItem {
  id: number;
  ticker: string;
  title: string;
  thesis: string;
  assumptions: string[];
  status: ThesisStatus;
  source_report_id?: number | null;
  drift_status: 'unknown' | 'stable' | 'drifted';
  drift_score?: number | null;
  last_checked_at?: string | null;
  updated_at: string;
  claims?: ThesisClaim[];
}

interface ThesisFormValues {
  ticker: string;
  title: string;
  thesis: string;
  assumptions: string;
  claims: string;
  status: ThesisStatus;
}

const claimStatus = {
  holding: { label: '保持', color: 'green' },
  confirmed: { label: '已确认', color: 'blue' },
  violated: { label: '已违背', color: 'red' },
  unknown: { label: '未知', color: 'default' },
} as const;

const driftStatus = {
  stable: { label: '稳定', color: 'green' },
  drifted: { label: '发生漂移', color: 'red' },
  unknown: { label: '待核验', color: 'default' },
} as const;

const splitLines = (value: string) => value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export default function Thesis() {
  const [items, setItems] = useState<ThesisItem[]>([]);
  const [selected, setSelected] = useState<ThesisItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ThesisItem | null>(null);
  const [form] = Form.useForm<ThesisFormValues>();

  const loadItems = useCallback(async (preferredId?: number) => {
    setLoading(true);
    try {
      const response = await apiClient.get('/thesis');
      const next = response.data.items as ThesisItem[];
      setItems(next);
      const targetId = preferredId ?? selected?.id ?? next[0]?.id;
      if (targetId) {
        const detail = await apiClient.get(`/thesis/${targetId}`);
        setSelected(detail.data);
      } else {
        setSelected(null);
      }
    } catch (error: unknown) {
      message.error(errorMessage(error, '加载投资论文失败'));
    } finally {
      setLoading(false);
    }
  }, [selected?.id]);

  useEffect(() => { void loadItems(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = () => {
    if (!selected) return;
    setEditing(selected);
    setModalOpen(true);
  };

  const hydrateForm = (open: boolean) => {
    if (!open) return;
    form.setFieldsValue(editing ? {
      ticker: editing.ticker,
      title: editing.title,
      thesis: editing.thesis,
      assumptions: editing.assumptions.join('\n'),
      claims: (editing.claims ?? []).filter((claim) => claim.kind === 'manual').map((claim) => claim.claim).join('\n'),
      status: editing.status,
    } : { ticker: '', title: '', thesis: '', assumptions: '', claims: '', status: 'open' });
  };

  const save = async () => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      assumptions: splitLines(values.assumptions),
      claims: splitLines(values.claims),
    };
    try {
      const response = editing
        ? await apiClient.put(`/thesis/${editing.id}`, payload)
        : await apiClient.post('/thesis', payload);
      setModalOpen(false);
      message.success(editing ? '论文已更新' : '论文已创建');
      await loadItems(response.data.id);
    } catch (error: unknown) {
      message.error(errorMessage(error, '保存投资论文失败'));
    }
  };

  const selectThesis = async (id: number) => {
    try {
      const response = await apiClient.get(`/thesis/${id}`);
      setSelected(response.data);
    } catch (error: unknown) {
      message.error(errorMessage(error, '加载论文详情失败'));
    }
  };

  const checkDrift = async () => {
    if (!selected) return;
    setChecking(true);
    try {
      const response = await apiClient.post(`/thesis/${selected.id}/check`);
      setSelected(response.data);
      setItems((current) => current.map((item) => item.id === response.data.id ? response.data : item));
      message.success(response.data.drift_status === 'drifted' ? '核验完成：检测到论点漂移' : '核验完成');
    } catch (error: unknown) {
      message.error(errorMessage(error, '漂移核验失败'));
    } finally {
      setChecking(false);
    }
  };

  const changeClaimStatus = async (claim: ThesisClaim, status: ClaimStatus) => {
    if (!selected) return;
    try {
      const response = await apiClient.put(`/thesis/${selected.id}/claims/${claim.id}`, { status, note: claim.note });
      setSelected(response.data);
    } catch (error: unknown) {
      message.error(errorMessage(error, '更新论点状态失败'));
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>投资论文追踪</Title>
          <Text type="secondary">用真实行情、持仓、基本面和新报告定期核验原始论点</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadItems()}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建论文</Button>
        </Space>
      </Space>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card title={`论文列表（${items.length}）`} size="small">
            <List
              loading={loading}
              dataSource={items}
              locale={{ emptyText: <Empty description="暂无投资论文" /> }}
              renderItem={(item) => (
                <List.Item onClick={() => void selectThesis(item.id)} style={{ cursor: 'pointer' }}>
                  <List.Item.Meta
                    title={<Space>{item.title}<Tag>{item.ticker}</Tag></Space>}
                    description={<Space><Tag color={driftStatus[item.drift_status].color}>{driftStatus[item.drift_status].label}</Tag><Text type="secondary">{item.updated_at}</Text></Space>}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          {selected ? (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Card
                title={<Space>{selected.title}<Tag>{selected.ticker}</Tag></Space>}
                extra={<Space><Button icon={<EditOutlined />} onClick={openEdit}>编辑</Button><Button type="primary" loading={checking} onClick={() => void checkDrift()}>重新核验</Button></Space>}
              >
                <Row gutter={16}>
                  <Col span={8}><Statistic title="漂移状态" value={driftStatus[selected.drift_status].label} /></Col>
                  <Col span={8}><Statistic title="漂移比例" value={selected.drift_score ?? 0} suffix="%" /></Col>
                  <Col span={8}><Statistic title="来源报告" value={selected.source_report_id ? `#${selected.source_report_id}` : '手动'} /></Col>
                </Row>
                <Title level={5}>核心论文</Title>
                <Paragraph style={{ whiteSpace: 'pre-wrap' }}>{selected.thesis}</Paragraph>
                <Title level={5}>关键假设</Title>
                {selected.assumptions.length ? selected.assumptions.map((item) => <Paragraph key={item}>• {item}</Paragraph>) : <Text type="secondary">未记录</Text>}
              </Card>

              <Card title="论点状态看板" size="small">
                <List
                  dataSource={selected.claims ?? []}
                  renderItem={(claim) => (
                    <List.Item
                      actions={claim.kind === 'manual' ? [
                        <Select
                          key="status"
                          size="small"
                          value={claim.status}
                          style={{ width: 100 }}
                          options={Object.entries(claimStatus).map(([value, meta]) => ({ value, label: meta.label }))}
                          onChange={(value) => void changeClaimStatus(claim, value)}
                        />,
                      ] : undefined}
                    >
                      <List.Item.Meta
                        title={<Space><Tag color={claimStatus[claim.status].color}>{claimStatus[claim.status].label}</Tag><Tag>{claim.kind}</Tag>{claim.claim}</Space>}
                        description={claim.note || '尚未核验'}
                      />
                    </List.Item>
                  )}
                />
              </Card>
            </Space>
          ) : <Card><Empty description="选择或新建一篇投资论文" /></Card>}
        </Col>
      </Row>

      <Modal
        title={editing ? '编辑投资论文' : '新建投资论文'}
        open={modalOpen}
        okText="保存"
        cancelText="取消"
        onOk={() => void save()}
        onCancel={() => setModalOpen(false)}
        afterOpenChange={hydrateForm}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="ticker" label="股票代码" rules={[{ required: true }]}><Input disabled={Boolean(editing)} placeholder="600519 / 00700 / AAPL" /></Form.Item>
          <Form.Item name="title" label="标题" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="thesis" label="核心论文" rules={[{ required: true }]}><Input.TextArea rows={5} /></Form.Item>
          <Form.Item name="assumptions" label="关键假设（每行一条）"><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="claims" label="手动论点（每行一条）"><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="status" label="状态"><Select options={[{ value: 'open', label: '跟踪中' }, { value: 'closed', label: '已关闭' }, { value: 'invalidated', label: '已失效' }]} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
