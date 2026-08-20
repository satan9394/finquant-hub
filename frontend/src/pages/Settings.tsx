/* ============================================================
 * Settings — 系统设置页（角色管理 + 主题切换）
 * ============================================================ */
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Alert, Card, Col, Table, Button, Modal, Form, Input, Row, Select, Popconfirm,
  Statistic, message, Tabs, Typography, Tag, Space, Switch, Empty,
} from 'antd';
import type { FormInstance } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, KeyOutlined } from '@ant-design/icons';
import apiClient from '../services/api';
import { useModelStore } from '../store/modelStore';
import type { AgentPreset } from '../types';
import MCPServerSettingsPanel from '../components/settings/MCPServerSettingsPanel';
import SystemSettingsPanel from '../components/settings/SystemSettingsPanel';
import FundamentalsSourcePanel from '../components/settings/FundamentalsSourcePanel';
import ProfessionalPreferencesPanel from '../components/settings/ProfessionalPreferencesPanel';


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

interface CredentialStatus {
  service: string;
  has_key: boolean;
  provider: string;
  updated_at?: string;
}

interface ScheduledResearchJob {
  id: number; name: string; ticker: string; last_status: string; last_error?: string | null;
}

interface ScheduledResearchRun {
  id: number; attempt: number; retry_of_run_id?: number | null; report_id?: number | null;
  status: string; evidence_status: string; evidence_ids: string[]; memory_record_ids: number[];
  error?: string | null; started_at: string; completed_at?: string | null;
}

export function ScheduledResearchLinkagePanel() {
  const [jobs, setJobs] = useState<ScheduledResearchJob[]>([]);
  const [runs, setRuns] = useState<ScheduledResearchRun[]>([]);
  const [selected, setSelected] = useState<ScheduledResearchJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadJobs = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await apiClient.get('/settings/research-jobs');
      setJobs(response.data.items);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '定时研究任务读取失败');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadJobs(); }, [loadJobs]);

  const showRuns = async (job: ScheduledResearchJob) => {
    setSelected(job); setLoading(true); setError('');
    try {
      const response = await apiClient.get(`/settings/research-jobs/${job.id}/runs`);
      setRuns(response.data.items);
    } catch (reason: unknown) {
      setRuns([]); setError(reason instanceof Error ? reason.message : '运行链路读取失败');
    } finally { setLoading(false); }
  };

  return (
    <Card title="定时研究运行链路" loading={loading} extra={<Button onClick={() => void loadJobs()}>刷新</Button>}>
      {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} /> : null}
      <Table rowKey="id" pagination={false} dataSource={jobs} locale={{ emptyText: '暂无定时研究任务' }} columns={[
        { title: '任务', dataIndex: 'name' }, { title: '标的', dataIndex: 'ticker' },
        { title: '状态', dataIndex: 'last_status', render: (value: string) => <Tag>{value}</Tag> },
        { title: '操作', render: (_: unknown, job: ScheduledResearchJob) => <Button onClick={() => void showRuns(job)}>运行历史</Button> },
      ]} />
      {selected ? <Table style={{ marginTop: 16 }} rowKey="id" pagination={false} dataSource={runs} locale={{ emptyText: '暂无运行历史' }} columns={[
        { title: '尝试', dataIndex: 'attempt', render: (value: number, run: ScheduledResearchRun) => `#${value}${run.retry_of_run_id ? ` · 重试 ${run.retry_of_run_id}` : ''}` },
        { title: '运行状态', dataIndex: 'status' },
        { title: '证据质量', dataIndex: 'evidence_status', render: (value: string) => <Tag color={value === 'OK' ? 'green' : value === 'UPSTREAM_ERROR' ? 'red' : 'default'}>{value}</Tag> },
        { title: '回链', render: (_: unknown, run: ScheduledResearchRun) => `报告 ${run.report_id ?? 'UNKNOWN'} · evidence ${run.evidence_ids.length} · memory ${run.memory_record_ids.length}` },
        { title: '错误', dataIndex: 'error', render: (value: string | null) => value || '—' },
      ]} /> : null}
    </Card>
  );
}

interface ProductMetricsSummary {
  enabled: boolean;
  retention_days: number;
  events_total: number;
  counts: {
    result_saved: number;
    workflow_continued: number;
    repeat_research: number;
    repeat_research_within_7d: number;
  };
  ttfv: {
    count: number;
    median_ms?: number | null;
    p90_ms?: number | null;
    insufficient_sample: boolean;
  };
}

export function ProductMetricsPanel() {
  const [summary, setSummary] = useState<ProductMetricsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await apiClient.get('/settings/product-metrics');
      setSummary(response.data as ProductMetricsSummary);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '本地产品指标读取失败');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const toggle = async (enabled: boolean) => {
    setSaving(true); setError('');
    try {
      const response = await apiClient.patch('/settings/product-metrics', { enabled });
      setSummary(response.data as ProductMetricsSummary);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '本地产品指标设置失败');
    } finally { setSaving(false); }
  };

  const clear = async () => {
    setSaving(true); setError('');
    try {
      await apiClient.delete('/settings/product-metrics/events');
      await load();
      message.success('当前用户的本地产品事件已清除');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '本地产品指标清除失败');
    } finally { setSaving(false); }
  };

  return (
    <Card
      title="本地产品指标"
      loading={loading}
      extra={<Space><Typography.Text>记录</Typography.Text><Switch aria-label="启用本地产品指标" checked={Boolean(summary?.enabled)} loading={saving} onChange={(checked) => void toggle(checked)} /></Space>}
    >
      <Alert
        type="info"
        showIcon
        message="默认关闭，仅保存在本机当前用户下"
        description="只记录 TTFV 毫秒、保存/继续计数和重复研究天数；不记录 ticker、对象 ID、查询、金融正文、模型回答或凭据。"
        style={{ marginBottom: 12 }}
      />
      {error ? <Alert type="error" showIcon message="本地产品指标不可用" description={error} style={{ marginBottom: 12 }} /> : null}
      {!summary?.enabled ? <Alert type="warning" showIcon message="指标已关闭，事件写入为零" /> : summary.events_total === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚无本地产品事件" />
      ) : (
        <>
          {summary.ttfv.insufficient_sample ? <Alert type="warning" showIcon message={`TTFV 样本 ${summary.ttfv.count} 条；少于 10 条时不显示中位数或 P90。`} style={{ marginBottom: 12 }} /> : null}
          <Row gutter={[12, 12]}>
            <Col xs={12} md={6}><Statistic title="事件数" value={summary.events_total} /></Col>
            <Col xs={12} md={6}><Statistic title="TTFV 中位数" value={summary.ttfv.median_ms ?? '样本不足'} suffix={summary.ttfv.median_ms == null ? undefined : 'ms'} /></Col>
            <Col xs={12} md={6}><Statistic title="保存" value={summary.counts.result_saved} /></Col>
            <Col xs={12} md={6}><Statistic title="继续工作流" value={summary.counts.workflow_continued} /></Col>
            <Col xs={12} md={6}><Statistic title="重复研究" value={summary.counts.repeat_research} /></Col>
            <Col xs={12} md={6}><Statistic title="7 日内重复" value={summary.counts.repeat_research_within_7d} /></Col>
          </Row>
        </>
      )}
      <Popconfirm
        title="清除当前用户的全部本地产品事件？"
        description="开关状态保留；事件删除后不可恢复。"
        okText="确认清除"
        cancelText="取消"
        onConfirm={() => void clear()}
        disabled={!summary?.events_total || saving}
      >
        <Button danger disabled={!summary?.events_total || saving} style={{ marginTop: 16 }}>清除本地指标</Button>
      </Popconfirm>
    </Card>
  );
}

const CREDENTIAL_SERVICES = [
  { service: 'tushare', label: 'Tushare Token', provider: 'tushare.pro', hint: 'A 股基本面数据' },
  { service: 'tavily', label: 'Tavily API Key', provider: 'tavily', hint: '新闻与网页搜索' },
  { service: 'serpapi', label: 'SerpAPI Key', provider: 'serpapi', hint: 'Google 新闻搜索' },
  { service: 'bocha', label: '博查 API Key', provider: 'bocha', hint: '中文网页搜索' },
  { service: 'brave', label: 'Brave Search Key', provider: 'brave', hint: 'Brave 新闻搜索' },
  { service: 'searxng', label: 'SearXNG 地址', provider: 'searxng', hint: '自托管搜索端点' },
  { service: 'mcp:default', label: 'MCP Bearer Token', provider: 'mcp', hint: '受保护 MCP 服务' },
] as const;


function CredentialPanel() {
  const [items, setItems] = useState<CredentialStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<(typeof CREDENTIAL_SERVICES)[number] | null>(null);
  const [secret, setSecret] = useState('');

  const loadCredentials = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<{ items: CredentialStatus[] }>('/me/credentials');
      setItems(response.data.items);
    } catch (reason: unknown) {
      message.error(reason instanceof Error ? reason.message : '凭据状态读取失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadCredentials(); }, [loadCredentials]);
  const statusByService = new Map(items.map((item) => [item.service, item]));
  const rows = CREDENTIAL_SERVICES.map((service) => ({
    ...service,
    status: statusByService.get(service.service),
  }));

  const closeEditor = () => {
    setSelected(null);
    setSecret('');
  };

  const saveCredential = async () => {
    if (!selected || !secret) return;
    const pending = selected;
    const value = secret;
    closeEditor();
    setSaving(true);
    try {
      await apiClient.put(`/me/credentials/${encodeURIComponent(pending.service)}`, {
        value,
        provider: pending.provider,
      });
      message.success(`${pending.label} 已加密保存`);
      await loadCredentials();
    } catch (reason: unknown) {
      message.error(reason instanceof Error ? reason.message : '凭据保存失败');
    } finally {
      setSaving(false);
    }
  };

  const removeCredential = async (service: string) => {
    try {
      await apiClient.delete(`/me/credentials/${encodeURIComponent(service)}`);
      message.success('凭据已删除');
      await loadCredentials();
    } catch (reason: unknown) {
      message.error(reason instanceof Error ? reason.message : '凭据删除失败');
    }
  };

  return (
    <Card title="API 密钥管理" extra={<Button onClick={() => void loadCredentials()}>刷新</Button>}>
      <Alert
        type="info"
        showIcon
        message="密钥使用 Fernet 加密，仅写入；保存后浏览器和 API 都不会再次显示明文。"
        style={{ marginBottom: 16 }}
      />
      <Table
        rowKey="service"
        loading={loading}
        pagination={false}
        dataSource={rows}
        columns={[
          {
            title: '服务',
            key: 'service',
            render: (_value, row) => (
              <Space direction="vertical" size={0}>
                <Typography.Text strong>{row.label}</Typography.Text>
                <Typography.Text type="secondary">{row.hint}</Typography.Text>
              </Space>
            ),
          },
          {
            title: '状态',
            key: 'status',
            width: 130,
            render: (_value, row) => row.status?.has_key
              ? <Tag color="success">已配置</Tag>
              : <Tag>未配置</Tag>,
          },
          {
            title: '更新时间',
            key: 'updated_at',
            width: 180,
            render: (_value, row) => row.status?.updated_at || '—',
          },
          {
            title: '操作',
            key: 'actions',
            width: 190,
            render: (_value, row) => (
              <Space>
                <Button icon={<KeyOutlined />} onClick={() => setSelected(row)}>
                  {row.status?.has_key ? '更新' : '配置'}
                </Button>
                {row.status?.has_key ? (
                  <Popconfirm
                    title="删除这项凭据？"
                    description="依赖该凭据的数据源将不可用。"
                    onConfirm={() => void removeCredential(row.service)}
                  >
                    <Button danger>删除</Button>
                  </Popconfirm>
                ) : null}
              </Space>
            ),
          },
        ]}
      />
      {selected ? (
        <Modal
          title={`配置 ${selected.label}`}
          open
          onCancel={closeEditor}
          onOk={() => void saveCredential()}
          okButtonProps={{ disabled: !secret, loading: saving }}
          okText="加密保存"
          cancelText="取消"
        >
          <Typography.Paragraph type="secondary">
            新值只在本次提交期间保存在页面内存中，提交后立即清空。
          </Typography.Paragraph>
          <Input.Password
            aria-label={`${selected.label} 凭据`}
            autoComplete="new-password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            placeholder="输入新凭据"
            autoFocus
          />
        </Modal>
      ) : null}
    </Card>
  );
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
      key: 'professional-preferences',
      label: '专业偏好',
      children: <ProfessionalPreferencesPanel />,
    },
    {
      key: 'system',
      label: '系统配置',
      children: <SystemSettingsPanel />,
    },
    {
      key: 'credentials',
      label: 'API 密钥',
      children: <CredentialPanel />,
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
      key: 'scheduled-research',
      label: '定时研究',
      children: <ScheduledResearchLinkagePanel />,
    },
    {
      key: 'product-metrics',
      label: '本地指标',
      children: <ProductMetricsPanel />,
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
      <Tabs defaultActiveKey="system" items={tabItems} />

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
