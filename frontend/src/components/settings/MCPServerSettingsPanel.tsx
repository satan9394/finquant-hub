import { useCallback, useEffect, useState } from 'react';
import { AutoComplete, Alert, Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from 'antd';
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
import { useLanguage } from '../../i18n/LanguageContext';


export default function MCPServerSettingsPanel() {
  const { t } = useLanguage();
  const [items, setItems] = useState<MCPServerConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MCPServerConfigItem | null>(null);
  const [transport, setTransport] = useState<'http' | 'stdio'>('http');
  // 表单里 args 以逗号分隔文本编辑，保存时拆分；避免与后端 string[] 契约冲突。
  const [form] = Form.useForm<{ name: string; url?: string; command?: string; args?: string }>();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await listMCPServerConfigs());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('settings.mcp.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openEditor = (item?: MCPServerConfigItem) => {
    setEditing(item ?? null);
    if (item) {
      form.setFieldsValue({
        name: item.name,
        url: item.url ?? undefined,
        command: item.command ?? undefined,
        args: item.args?.join(', '),
      });
      setTransport(item.command ? 'stdio' : 'http');
    } else {
      form.resetFields();
      setTransport('http');
    }
    setModalOpen(true);
  };

  const save = async () => {
    let values: MCPServerConfigInput;
    try {
      const raw = await form.validateFields();
      values = transport === 'stdio'
        ? { name: raw.name, command: raw.command, args: (raw.args ?? '').split(',').map((part) => part.trim()).filter(Boolean) }
        : { name: raw.name, url: raw.url };
    } catch {
      return;
    }
    try {
      if (editing) await updateMCPServerConfig(editing.id, values);
      else await createMCPServerConfig(values);
      message.success(t(editing ? 'settings.mcp.updated' : 'settings.mcp.saved'));
      setModalOpen(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('settings.mcp.saveFailed'));
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
      message.success(t(updated.connected ? 'settings.mcp.connected' : 'settings.mcp.disconnected'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('settings.mcp.connectionFailed'));
      await load();
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: number) => {
    try {
      await deleteMCPServerConfig(id);
      setItems((current) => current.filter((item) => item.id !== id));
      message.success(t('settings.mcp.deleted'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('settings.mcp.deleteFailed'));
    }
  };

  return (
    <Card
      title={<Space><ApiOutlined />{t('settings.mcp.title')}</Space>}
      extra={<Space><Button href="/mcp-market" icon={<LinkOutlined />}>{t('settings.mcp.catalog')}</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>{t('settings.mcp.add')}</Button></Space>}
      data-testid="mcp-server-settings-panel"
    >
      <Alert
        type="warning"
        showIcon
        message={t('settings.mcp.notice')}
        style={{ marginBottom: 16 }}
      />
      {error ? <Alert type="error" showIcon message={error} closable onClose={() => setError('')} style={{ marginBottom: 16 }} /> : null}
      <Table<MCPServerConfigItem>
        rowKey="id"
        loading={loading}
        dataSource={items}
        pagination={false}
        locale={{ emptyText: t('settings.mcp.empty') }}
        columns={[
          { title: t('settings.mcp.name'), dataIndex: 'name', key: 'name' },
          { title: t('settings.mcp.url'), dataIndex: 'url', key: 'url', ellipsis: true },
          {
            title: t('settings.status'), key: 'status', width: 150,
            render: (_, item) => item.connected
              ? <Tag color="success">{t('settings.mcp.statusConnected')}</Tag>
              : item.last_error
                ? <Tag color="error">{t('settings.mcp.statusFailed')}</Tag>
                : <Tag>{t('settings.mcp.statusDisconnected')}</Tag>,
          },
          {
            title: t('settings.mcp.error'), dataIndex: 'last_error', key: 'last_error', ellipsis: true,
            render: (value: string | null) => <Typography.Text type="danger">{value || '—'}</Typography.Text>,
          },
          {
            title: t('settings.actions'), key: 'actions', width: 290,
            render: (_, item) => (
              <Space>
                <Button loading={busy === item.id} onClick={() => void toggleConnection(item)}>
                  {t(item.connected ? 'settings.mcp.disconnect' : 'settings.mcp.connect')}
                </Button>
                <Button icon={<EditOutlined />} onClick={() => openEditor(item)}>{t('settings.mcp.edit')}</Button>
                <Popconfirm title={t('settings.mcp.deleteConfirm')} onConfirm={() => void remove(item.id)}>
                  <Button danger icon={<DeleteOutlined />}>{t('settings.delete')}</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={t(editing ? 'settings.mcp.editTitle' : 'settings.mcp.addTitle')}
        open={modalOpen}
        onOk={() => void save()}
        onCancel={() => setModalOpen(false)}
        okText={t('settings.agents.save')}
        cancelText={t('settings.cancel')}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={t('settings.mcp.serverName')} rules={[{ required: true, whitespace: true, max: 80 }]}>
            <Input placeholder="research-tools" />
          </Form.Item>
          <Form.Item label={t('settings.mcp.transport')}>
            <Select
              aria-label={t('settings.mcp.transport')}
              value={transport}
              onChange={setTransport}
              options={[
                { label: t('settings.mcp.transportHttp'), value: 'http' },
                { label: t('settings.mcp.transportStdio'), value: 'stdio' },
              ]}
            />
          </Form.Item>
          {transport === 'http' ? (
            <Form.Item
              name="url"
              label={t('settings.mcp.serverUrl')}
              rules={[
                { required: true, whitespace: true },
                { pattern: /^https?:\/\//i, message: t('settings.mcp.urlInvalid') },
              ]}
            >
              <Input placeholder="https://mcp.example.com/api" />
            </Form.Item>
          ) : (
            <>
              <Form.Item name="command" label={t('settings.mcp.command')} rules={[{ required: true, whitespace: true }]}>
                <AutoComplete
                  options={[{ value: 'npx' }, { value: 'uvx' }, { value: 'node' }]}
                  placeholder="npx / uvx / node ..."
                />
              </Form.Item>
              <Form.Item name="args" label={t('settings.mcp.args')} extra={t('settings.mcp.argsHelp')}>
                <Input placeholder="--param value, server-name" />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </Card>
  );
}
