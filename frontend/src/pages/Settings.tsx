/* ============================================================
 * Settings — 系统设置页（角色管理 + 主题切换）
 * ============================================================ */
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Alert, Card, Col, Table, Button, Modal, Form, Input, Row, Select, Popconfirm,
  Statistic, message, Tabs, Typography,
} from 'antd';
import type { FormInstance } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import apiClient from '../services/api';
import { useModelStore } from '../store/modelStore';
import type { AgentPreset } from '../types';
import MCPServerSettingsPanel from '../components/settings/MCPServerSettingsPanel';
import SystemSettingsPanel from '../components/settings/SystemSettingsPanel';
import FundamentalsSourcePanel from '../components/settings/FundamentalsSourcePanel';


interface UsageSummary {
  days: number;
  items: Array<{
    day: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    request_count: number;
  }>;
  total: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    request_count: number;
  };
  by_session_type: Array<{
    session_type: string;
    total_tokens: number;
    request_count: number;
  }>;
}


function UsagePanel() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadUsage = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiClient.get<UsageSummary>('/usage', { params: { days: 30 } });
      setUsage(response.data);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '用量读取失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsage(); }, [loadUsage]);

  return (
    <Card title="最近 30 天 LLM 用量" loading={loading} extra={<Button onClick={loadUsage}>刷新</Button>}>
      {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} lg={6}><Statistic title="总 Token" value={usage?.total.total_tokens ?? 0} /></Col>
        <Col xs={12} lg={6}><Statistic title="输入 Token" value={usage?.total.prompt_tokens ?? 0} /></Col>
        <Col xs={12} lg={6}><Statistic title="输出 Token" value={usage?.total.completion_tokens ?? 0} /></Col>
        <Col xs={12} lg={6}><Statistic title="模型请求" value={usage?.total.request_count ?? 0} /></Col>
      </Row>
      <Typography.Title level={5}>按场景</Typography.Title>
      <Table
        size="small"
        rowKey="session_type"
        pagination={false}
        dataSource={usage?.by_session_type ?? []}
        columns={[
          { title: '场景', dataIndex: 'session_type' },
          { title: 'Token', dataIndex: 'total_tokens' },
          { title: '请求数', dataIndex: 'request_count' },
        ]}
      />
      <Typography.Title level={5} style={{ marginTop: 20 }}>按日</Typography.Title>
      <Table
        size="small"
        rowKey="day"
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        dataSource={usage?.items ?? []}
        columns={[
          { title: '日期（UTC）', dataIndex: 'day' },
          { title: '输入 Token', dataIndex: 'prompt_tokens' },
          { title: '输出 Token', dataIndex: 'completion_tokens' },
          { title: '总 Token', dataIndex: 'total_tokens' },
          { title: '请求数', dataIndex: 'request_count' },
        ]}
      />
    </Card>
  );
}


export default function Settings() {
  const models = useModelStore((s) => s.models);

  const [agents, setAgents] = useState<AgentPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentPreset | null>(null);
  const formRef = useRef<FormInstance>(null);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/agents');
      setAgents(res.data.items);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAgents(); }, [loadAgents]);
  useEffect(() => {
    if (!modalOpen || !formRef.current) return;
    if (editingAgent) {
      formRef.current.setFieldsValue(editingAgent);
    } else {
      formRef.current.resetFields();
    }
  }, [editingAgent, modalOpen]);


  // 打开编辑
  const openEdit = (agent?: AgentPreset) => {
    if (agent) {
      setEditingAgent(agent);
    } else {
      setEditingAgent(null);
    }
    setModalOpen(true);
  };

  // 保存角色
  const handleSave = async () => {
    const values = await formRef.current?.validateFields();
    if (!values) return;
    try {
      if (editingAgent) {
        await apiClient.put(`/agents/${editingAgent.id}`, values);
        message.success('已更新');
      } else {
        await apiClient.post('/agents', values);
        message.success('已创建');
      }
      setModalOpen(false);
      loadAgents();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  // 删除角色
  const handleDelete = async (id: number) => {
    try {
      await apiClient.delete(`/agents/${id}`);
      message.success('已删除');
      loadAgents();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    { title: '标识', dataIndex: 'role_key', key: 'role_key' },
    { title: '头像', dataIndex: 'avatar', key: 'avatar', width: 60 },
    { title: '预置', dataIndex: 'is_preset', key: 'is_preset', width: 80, render: (v: number) => v === 1 ? '系统' : '用户' },
    { title: 'System Prompt', dataIndex: 'system_prompt', key: 'system_prompt', ellipsis: true, render: (v: string) => v?.slice(0, 80) + '...' },
    { title: '操作', key: 'actions', width: 160, render: (_: any, record: AgentPreset) => (
      <div style={{ display: 'flex', gap: 4 }}>
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
        <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
          <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      </div>
    )},
  ];

  const tabItems = [
    {
      key: 'system',
      label: '系统配置',
      children: <SystemSettingsPanel />,
    },
    {
      key: 'mcp',
      label: 'MCP 服务器',
      children: <MCPServerSettingsPanel />,
    },
    {
      key: 'fundamentals-sources',
      label: '基本面数据源',
      children: <FundamentalsSourcePanel />,
    },
    {
      key: 'agents',
      label: '角色管理',
      children: (
        <Card
          extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit()}>新增角色</Button>}
        >
          <Table
            dataSource={agents}
            columns={columns}
            rowKey="id"
            loading={loading}
            pagination={false}
          />
        </Card>
      ),
    },
    {
      key: 'usage',
      label: 'LLM 用量',
      children: <UsagePanel />,
    },
    {
      key: 'appearance',
      label: '外观',
      children: (
        <Card title="主题设置">
          <Typography.Text type="secondary">
            明暗主题切换已移至页面顶部栏，请使用太阳或月亮按钮切换。
          </Typography.Text>
        </Card>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Tabs items={tabItems} />

      {/* 编辑角色 Modal */}
      <Modal
        title={editingAgent ? '编辑角色' : '新增角色'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width={600}
      >
        <Form ref={formRef} layout="vertical">
          <Form.Item name="name" label="角色名称" rules={[{ required: true }]}>
            <Input placeholder="价值投资官" />
          </Form.Item>
          <Form.Item name="role_key" label="角色标识" rules={[{ required: true }]}>
            <Input placeholder="value_investor" disabled={!!editingAgent} />
          </Form.Item>
          <Form.Item name="avatar" label="头像">
            <Input placeholder="🏛️" />
          </Form.Item>
          <Form.Item name="model_id" label="绑定模型">
            <Select
              allowClear
              placeholder="不绑定（使用全局默认）"
              options={models.map((m) => ({ label: m.name, value: m.id }))}
            />
          </Form.Item>
          <Form.Item name="system_prompt" label="System Prompt" rules={[{ required: true }]}>
            <Input.TextArea rows={8} placeholder="请填写 System Prompt..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
