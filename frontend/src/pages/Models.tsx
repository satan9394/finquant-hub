/* ============================================================
 * Models — 模型管理页
 * ============================================================ */
import { useEffect, useState, useCallback } from 'react';
import {
  Card, Table, Button, Modal, Form, Input, InputNumber, Select, Popconfirm, Tag, message, Typography,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ApiOutlined, CheckCircleOutlined, StarOutlined } from '@ant-design/icons';
import apiClient from '../services/api';
import { useModelStore } from '../store/modelStore';
import type { ModelConfig, ModelTestResult } from '../types';

const { Text } = Typography;

export default function Models() {
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

  // 打开新增/编辑
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

  // 保存
  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      if (editingModel) {
        await apiClient.put(`/models/${editingModel.id}`, values);
        message.success('已更新');
      } else {
        await apiClient.post('/models', values);
        message.success('已创建');
      }
      setModalOpen(false);
      loadModels();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  // 删除
  const handleDelete = async (id: number) => {
    try {
      await apiClient.delete(`/models/${id}`);
      message.success('已删除');
      loadModels();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  // 测试连通性
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

  // 设为默认
  const handleSetDefault = async (id: number) => {
    try {
      await apiClient.post(`/models/${id}/set-default`);
      message.success('已设为默认');
      loadModels();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name', render: (v: string, r: ModelConfig) => (
      <span>{v} {r.is_default === 1 && <Tag color="gold" icon={<StarOutlined />}>默认</Tag>}</span>
    )},
    { title: '供应商', dataIndex: 'provider', key: 'provider', width: 100 },
    { title: 'Endpoint', dataIndex: 'base_url', key: 'base_url', ellipsis: true },
    { title: '模型名', dataIndex: 'model_name', key: 'model_name' },
    { title: '凭据', key: 'credentials', width: 150, render: (_: unknown, record: ModelConfig) => (
      <Text type={record.has_api_key ? undefined : 'danger'}>
        {record.api_key_env ? `环境变量：${record.api_key_env}` : record.has_api_key ? '已安全保存' : '未配置'}
      </Text>
    ) },
    { title: 'Temperature', dataIndex: 'temperature', key: 'temperature', width: 110, render: (v: number) => v?.toFixed(1) },
    { title: '操作', key: 'actions', width: 280, render: (_: any, record: ModelConfig) => (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <Button size="small" icon={<EditOutlined />} onClick={() => openModal(record)}>编辑</Button>
        <Button
          size="small"
          icon={<ApiOutlined />}
          loading={testLoading === record.id}
          onClick={() => handleTest(record.id)}
        >
          测试
        </Button>
        {record.is_default !== 1 && (
          <Button size="small" icon={<StarOutlined />} onClick={() => handleSetDefault(record.id)}>设为默认</Button>
        )}
        <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
          <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      </div>
    )},
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title="模型管理"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>新增模型</Button>}
      >
        <Table
          dataSource={models}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
        />

        {/* 测试结果显示 */}
        {testResult && (
          <div style={{ marginTop: 16, padding: 12, background: testResult.result.ok ? '#f6ffed' : '#fff2f0', borderRadius: 4 }}>
            <Text strong>
              {testResult.result.ok ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <ApiOutlined style={{ color: '#ff4d4f' }} />}
              {' '}测试结果
            </Text>
            <div style={{ marginTop: 4, fontSize: 13 }}>
              <div>{testResult.result.message}</div>
              {testResult.result.latency_ms != null && (
                <div>延迟: {testResult.result.latency_ms}ms</div>
              )}
              {testResult.result.reply && (
                <div>回复: {testResult.result.reply}</div>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* 新增/编辑 Modal */}
      <Modal
        title={editingModel ? '编辑模型' : '新增模型'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width={520}
      >
        <Form form={form} layout="vertical" initialValues={{ provider: 'openai', temperature: 0.7, max_tokens: 4096 }}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入模型名称' }]}>
            <Input placeholder="如 DeepSeek Flash" />
          </Form.Item>
          <Form.Item name="provider" label="供应商">
            <Select options={[
              { label: 'OpenAI 兼容', value: 'openai' },
              { label: 'DeepSeek（OpenAI 兼容）', value: 'deepseek' },
              { label: 'OpenRouter（OpenAI 兼容）', value: 'openrouter' },
              { label: '其他 OpenAI 兼容接口', value: 'custom' },
            ]} />
          </Form.Item>
          <Form.Item name="base_url" label="Endpoint" rules={[{ required: true }]}>
            <Input placeholder="https://api.deepseek.com" />
          </Form.Item>
          <Form.Item name="model_name" label="模型名" rules={[{ required: true }]}>
            <Input placeholder="deepseek-v4-flash" />
          </Form.Item>
          <Form.Item name="api_key" label="API Key（仅写入，不会再次展示）">
            <Input.Password placeholder="sk-xxx；留空则保留既有值" />
          </Form.Item>
          <Form.Item name="api_key_env" label="API Key 环境变量（推荐）">
            <Input placeholder="如 OPENAI_API_KEY；未保存密钥时从环境变量读取" />
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
