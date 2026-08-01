import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Button, Card, Form, Input, Modal, Popconfirm, Space, Table, Tag, Typography, message,
} from 'antd';
import { ApiOutlined, DeleteOutlined, EditOutlined, LinkOutlined, PlusOutlined } from '@ant-design/icons';
import {
  connectMCPServer,
  createMCPServerConfig,
  deleteMCPServerConfig,
  disconnectMCPServer,
  listMCPServerConfigs,
  updateMCPServerConfig,
  type MCPServerConfigInput,
  type MCPServerConfigItem,
} from '../../services/mcpApi';


export default function MCPServerSettingsPanel() {
  const [items, setItems] = useState<MCPServerConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MCPServerConfigItem | null>(null);
  const [form] = Form.useForm<MCPServerConfigInput>();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await listMCPServerConfigs());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'MCP 服务器配置加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openEditor = (item?: MCPServerConfigItem) => {
    setEditing(item ?? null);
    if (item) form.setFieldsValue({ name: item.name, url: item.url });
    else form.resetFields();
    setModalOpen(true);
  };

  const save = async () => {
    let values: MCPServerConfigInput;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    try {
      if (editing) await updateMCPServerConfig(editing.id, values);
      else await createMCPServerConfig(values);
      message.success(editing ? 'MCP 服务器已更新，请重新连接' : 'MCP 服务器已保存');
      setModalOpen(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'MCP 服务器保存失败');
    }
  };

  const toggleConnection = async (item: MCPServerConfigItem) => {
    setBusy(item.id);
    setError('');
    try {
      const updated = item.connected
        ? await disconnectMCPServer(item.id)
        : await connectMCPServer(item.id);
      setItems((current) => current.map((candidate) => candidate.id === item.id ? updated : candidate));
      message.success(updated.connected ? 'MCP 服务器已连接' : 'MCP 服务器已断开');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'MCP 服务器连接状态更新失败');
      await load();
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: number) => {
    try {
      await deleteMCPServerConfig(id);
      setItems((current) => current.filter((item) => item.id !== id));
      message.success('MCP 服务器已删除');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'MCP 服务器删除失败');
    }
  };

  return (
    <Card
      title={<Space><ApiOutlined />HTTP MCP 服务器</Space>}
      extra={<Space><Button href="/mcp-market" icon={<LinkOutlined />}>查看工具目录</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>添加服务器</Button></Space>}
      data-testid="mcp-server-settings-panel"
    >
      <Alert
        type="warning"
        showIcon
        message="为避免无认证接口变成命令执行入口，此处只接受 HTTP(S) MCP 地址，不接受 command 或 env。"
        style={{ marginBottom: 16 }}
      />
      {error ? <Alert type="error" showIcon message={error} closable onClose={() => setError('')} style={{ marginBottom: 16 }} /> : null}
      <Table<MCPServerConfigItem>
        rowKey="id"
        loading={loading}
        dataSource={items}
        pagination={false}
        locale={{ emptyText: '尚未配置 HTTP MCP 服务器' }}
        columns={[
          { title: '名称', dataIndex: 'name', key: 'name' },
          { title: '地址', dataIndex: 'url', key: 'url', ellipsis: true },
          {
            title: '状态', key: 'status', width: 150,
            render: (_, item) => item.connected
              ? <Tag color="success">已连接</Tag>
              : item.last_error
                ? <Tag color="error">连接失败</Tag>
                : <Tag>未连接</Tag>,
          },
          {
            title: '错误', dataIndex: 'last_error', key: 'last_error', ellipsis: true,
            render: (value: string | null) => <Typography.Text type="danger">{value || '—'}</Typography.Text>,
          },
          {
            title: '操作', key: 'actions', width: 290,
            render: (_, item) => (
              <Space>
                <Button loading={busy === item.id} onClick={() => void toggleConnection(item)}>
                  {item.connected ? '断开' : '连接'}
                </Button>
                <Button icon={<EditOutlined />} onClick={() => openEditor(item)}>编辑</Button>
                <Popconfirm title="删除此 MCP 服务器？" onConfirm={() => void remove(item.id)}>
                  <Button danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editing ? '编辑 MCP 服务器' : '添加 MCP 服务器'}
        open={modalOpen}
        onOk={() => void save()}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="服务器名称" rules={[{ required: true, whitespace: true, max: 80 }]}>
            <Input placeholder="research-tools" />
          </Form.Item>
          <Form.Item
            name="url"
            label="HTTP(S) MCP 地址"
            rules={[
              { required: true, whitespace: true },
              { pattern: /^https?:\/\//i, message: '请输入 http:// 或 https:// 地址' },
            ]}
          >
            <Input placeholder="https://mcp.example.com/api" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
