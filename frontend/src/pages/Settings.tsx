/* ============================================================
 * Settings — 系统设置页（角色管理 + 主题切换）
 * ============================================================ */
import { useEffect, useState, useCallback } from 'react';
import {
  Card, Table, Button, Modal, Form, Input, Select, Popconfirm, Switch, message, Typography, Tabs,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, BulbOutlined } from '@ant-design/icons';
import apiClient from '../services/api';
import { useModelStore } from '../store/modelStore';
import type { AgentPreset } from '../types';

const { Text } = Typography;

export default function Settings() {
  const models = useModelStore((s) => s.models);

  const [agents, setAgents] = useState<AgentPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentPreset | null>(null);
  const [form] = Form.useForm();
  const [themeDark, setThemeDark] = useState(() => {
    return localStorage.getItem('finquant_theme') === 'dark';
  });

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

  // 主题切换
  const handleThemeChange = (dark: boolean) => {
    setThemeDark(dark);
    localStorage.setItem('finquant_theme', dark ? 'dark' : 'light');
    message.success(dark ? '已切换到暗色模式' : '已切换到亮色模式');
  };

  // 打开编辑
  const openEdit = (agent?: AgentPreset) => {
    if (agent) {
      setEditingAgent(agent);
      form.setFieldsValue(agent);
    } else {
      setEditingAgent(null);
      form.resetFields();
    }
    setModalOpen(true);
  };

  // 保存角色
  const handleSave = async () => {
    const values = await form.validateFields();
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
      key: 'appearance',
      label: '外观',
      children: (
        <Card title="主题设置">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <BulbOutlined style={{ fontSize: 20 }} />
            <Text>暗色模式</Text>
            <Switch checked={themeDark} onChange={handleThemeChange} />
          </div>
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
        <Form form={form} layout="vertical">
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
