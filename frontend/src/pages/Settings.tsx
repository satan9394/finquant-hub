/* Settings page: preferences, credentials, agents, usage, and appearance. */
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
import { useLanguage } from '../i18n/LanguageContext';
import UsageTrendChart from '../components/settings/UsageTrendChart';
import UsageRecordsPanel from '../components/settings/UsageRecordsPanel';


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
  const { t } = useLanguage();
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
      setError(reason instanceof Error ? reason.message : t('settings.scheduled.loadFailed'));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadJobs(); }, [loadJobs]);

  const showRuns = async (job: ScheduledResearchJob) => {
    setSelected(job); setLoading(true); setError('');
    try {
      const response = await apiClient.get(`/settings/research-jobs/${job.id}/runs`);
      setRuns(response.data.items);
    } catch (reason: unknown) {
      setRuns([]); setError(reason instanceof Error ? reason.message : t('settings.scheduled.runsFailed'));
    } finally { setLoading(false); }
  };

  return (
    <Card title={t('settings.scheduled.title')} loading={loading} extra={<Button onClick={() => void loadJobs()}>{t('settings.refresh')}</Button>}>
      {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} /> : null}
      <Table rowKey="id" pagination={false} dataSource={jobs} locale={{ emptyText: t('settings.scheduled.empty') }} columns={[
        { title: t('settings.scheduled.job'), dataIndex: 'name' }, { title: t('settings.ticker'), dataIndex: 'ticker' },
        { title: t('settings.status'), dataIndex: 'last_status', render: (value: string) => <Tag>{value}</Tag> },
        { title: t('settings.actions'), render: (_: unknown, job: ScheduledResearchJob) => <Button onClick={() => void showRuns(job)}>{t('settings.scheduled.runHistory')}</Button> },
      ]} />
      {selected ? <Table style={{ marginTop: 16 }} rowKey="id" pagination={false} dataSource={runs} locale={{ emptyText: t('settings.scheduled.noRuns') }} columns={[
        { title: t('settings.scheduled.attempt'), dataIndex: 'attempt', render: (value: number, run: ScheduledResearchRun) => `#${value}${run.retry_of_run_id ? ` · ${t('settings.scheduled.retry', { id: run.retry_of_run_id })}` : ''}` },
        { title: t('settings.scheduled.runStatus'), dataIndex: 'status' },
        { title: t('settings.scheduled.evidenceQuality'), dataIndex: 'evidence_status', render: (value: string) => <Tag color={value === 'OK' ? 'green' : value === 'UPSTREAM_ERROR' ? 'red' : 'default'}>{value}</Tag> },
        { title: t('settings.scheduled.links'), render: (_: unknown, run: ScheduledResearchRun) => t('settings.scheduled.linksValue', { report: run.report_id ?? 'UNKNOWN', evidence: run.evidence_ids.length, memory: run.memory_record_ids.length }) },
        { title: t('settings.scheduled.error'), dataIndex: 'error', render: (value: string | null) => value || '—' },
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
  const { t } = useLanguage();
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
      setError(reason instanceof Error ? reason.message : t('settings.metrics.loadFailed'));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const toggle = async (enabled: boolean) => {
    setSaving(true); setError('');
    try {
      const response = await apiClient.patch('/settings/product-metrics', { enabled });
      setSummary(response.data as ProductMetricsSummary);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : t('settings.metrics.saveFailed'));
    } finally { setSaving(false); }
  };

  const clear = async () => {
    setSaving(true); setError('');
    try {
      await apiClient.delete('/settings/product-metrics/events');
      await load();
      message.success(t('settings.metrics.cleared'));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : t('settings.metrics.clearFailed'));
    } finally { setSaving(false); }
  };

  return (
    <Card
      title={t('settings.metrics.title')}
      loading={loading}
      extra={<Space><Typography.Text>{t('settings.metrics.record')}</Typography.Text><Switch aria-label={t('settings.metrics.enableAria')} checked={Boolean(summary?.enabled)} loading={saving} onChange={(checked) => void toggle(checked)} /></Space>}
    >
      <Alert
        type="info"
        showIcon
        message={t('settings.metrics.notice')}
        description={t('settings.metrics.noticeDescription')}
        style={{ marginBottom: 12 }}
      />
      {error ? <Alert type="error" showIcon message={t('settings.metrics.unavailable')} description={error} style={{ marginBottom: 12 }} /> : null}
      {!summary?.enabled ? <Alert type="warning" showIcon message={t('settings.metrics.disabled')} /> : summary.events_total === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('settings.metrics.empty')} />
      ) : (
        <>
          {summary.ttfv.insufficient_sample ? <Alert type="warning" showIcon message={t('settings.metrics.insufficient', { count: summary.ttfv.count })} style={{ marginBottom: 12 }} /> : null}
          <Row gutter={[12, 12]}>
            <Col xs={12} md={6}><Statistic title={t('settings.metrics.events')} value={summary.events_total} /></Col>
            <Col xs={12} md={6}><Statistic title={t('settings.metrics.median')} value={summary.ttfv.median_ms ?? t('settings.metrics.insufficientValue')} suffix={summary.ttfv.median_ms == null ? undefined : 'ms'} /></Col>
            <Col xs={12} md={6}><Statistic title={t('settings.metrics.saved')} value={summary.counts.result_saved} /></Col>
            <Col xs={12} md={6}><Statistic title={t('settings.metrics.continued')} value={summary.counts.workflow_continued} /></Col>
            <Col xs={12} md={6}><Statistic title={t('settings.metrics.repeat')} value={summary.counts.repeat_research} /></Col>
            <Col xs={12} md={6}><Statistic title={t('settings.metrics.repeat7d')} value={summary.counts.repeat_research_within_7d} /></Col>
          </Row>
        </>
      )}
      <Popconfirm
        title={t('settings.metrics.clearConfirm')}
        description={t('settings.metrics.clearDescription')}
        okText={t('settings.metrics.clearOk')}
        cancelText={t('settings.cancel')}
        onConfirm={() => void clear()}
        disabled={!summary?.events_total || saving}
      >
        <Button danger disabled={!summary?.events_total || saving} style={{ marginTop: 16 }}>{t('settings.metrics.clear')}</Button>
      </Popconfirm>
    </Card>
  );
}

const CREDENTIAL_SERVICES = [
  { service: 'tushare', labelKey: 'settings.credentials.label.tushare', provider: 'tushare.pro', hintKey: 'settings.credentials.hint.tushare' },
  { service: 'tavily', labelKey: 'settings.credentials.label.tavily', provider: 'tavily', hintKey: 'settings.credentials.hint.tavily' },
  { service: 'serpapi', labelKey: 'settings.credentials.label.serpapi', provider: 'serpapi', hintKey: 'settings.credentials.hint.serpapi' },
  { service: 'bocha', labelKey: 'settings.credentials.label.bocha', provider: 'bocha', hintKey: 'settings.credentials.hint.bocha' },
  { service: 'brave', labelKey: 'settings.credentials.label.brave', provider: 'brave', hintKey: 'settings.credentials.hint.brave' },
  { service: 'searxng', labelKey: 'settings.credentials.label.searxng', provider: 'searxng', hintKey: 'settings.credentials.hint.searxng' },
  { service: 'mcp:default', labelKey: 'settings.credentials.label.mcp', provider: 'mcp', hintKey: 'settings.credentials.hint.mcp' },
] as const;

type CredentialServiceView = (typeof CREDENTIAL_SERVICES)[number] & {
  label: string;
  hint: string;
  status?: CredentialStatus;
};

function CredentialPanel() {
  const { t } = useLanguage();
  const [items, setItems] = useState<CredentialStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<CredentialServiceView | null>(null);
  const [secret, setSecret] = useState('');

  const loadCredentials = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<{ items: CredentialStatus[] }>('/me/credentials');
      setItems(response.data.items);
    } catch (reason: unknown) {
      message.error(reason instanceof Error ? reason.message : t('settings.credentials.statusFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadCredentials(); }, [loadCredentials]);
  const statusByService = new Map(items.map((item) => [item.service, item]));
  const rows = CREDENTIAL_SERVICES.map((service) => ({
    ...service,
    label: t(service.labelKey),
    hint: t(service.hintKey),
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
      message.success(t('settings.credentials.saved', { label: pending.label }));
      await loadCredentials();
    } catch (reason: unknown) {
      message.error(reason instanceof Error ? reason.message : t('settings.credentials.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const removeCredential = async (service: string) => {
    try {
      await apiClient.delete(`/me/credentials/${encodeURIComponent(service)}`);
      message.success(t('settings.credentials.deleted'));
      await loadCredentials();
    } catch (reason: unknown) {
      message.error(reason instanceof Error ? reason.message : t('settings.credentials.deleteFailed'));
    }
  };

  return (
    <Card title={t('settings.credentials.title')} extra={<Button onClick={() => void loadCredentials()}>{t('settings.refresh')}</Button>}>
      <Alert
        type="info"
        showIcon
        message={t('settings.credentials.notice')}
        style={{ marginBottom: 16 }}
      />
      <Table
        rowKey="service"
        loading={loading}
        pagination={false}
        dataSource={rows}
        columns={[
          {
            title: t('settings.credentials.service'),
            key: 'service',
            render: (_value, row) => (
              <Space direction="vertical" size={0}>
                <Typography.Text strong>{row.label}</Typography.Text>
                <Typography.Text type="secondary">{row.hint}</Typography.Text>
              </Space>
            ),
          },
          {
            title: t('settings.status'),
            key: 'status',
            width: 130,
            render: (_value, row) => row.status?.has_key
              ? <Tag color="success">{t('settings.credentials.configured')}</Tag>
              : <Tag>{t('settings.credentials.notConfigured')}</Tag>,
          },
          {
            title: t('settings.credentials.updatedAt'),
            key: 'updated_at',
            width: 180,
            render: (_value, row) => row.status?.updated_at || '—',
          },
          {
            title: t('settings.actions'),
            key: 'actions',
            width: 190,
            render: (_value, row) => (
              <Space>
                <Button icon={<KeyOutlined />} onClick={() => setSelected(row)}>
                  {t(row.status?.has_key ? 'settings.credentials.update' : 'settings.credentials.configure')}
                </Button>
                {row.status?.has_key ? (
                  <Popconfirm
                    title={t('settings.credentials.deleteConfirm')}
                    description={t('settings.credentials.deleteDescription')}
                    onConfirm={() => void removeCredential(row.service)}
                  >
                    <Button danger>{t('settings.delete')}</Button>
                  </Popconfirm>
                ) : null}
              </Space>
            ),
          },
        ]}
      />
      {selected ? (
        <Modal
          title={t('settings.credentials.modalTitle', { label: selected.label })}
          open
          onCancel={closeEditor}
          onOk={() => void saveCredential()}
          okButtonProps={{ disabled: !secret, loading: saving }}
          okText={t('settings.credentials.encryptSave')}
          cancelText={t('settings.cancel')}
        >
          <Typography.Paragraph type="secondary">
            {t('settings.credentials.editorNotice')}
          </Typography.Paragraph>
          <Input.Password
            aria-label={t('settings.credentials.aria', { label: selected.label })}
            autoComplete="new-password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            placeholder={t('settings.credentials.placeholder')}
            autoFocus
          />
        </Modal>
      ) : null}
    </Card>
  );
}


function UsagePanel() {
  const { t } = useLanguage();
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
      setError(reason instanceof Error ? reason.message : t('settings.usage.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsage(); }, [loadUsage]);

  return (
    <Card title={t('settings.usage.title')} loading={loading} extra={<Button onClick={loadUsage}>{t('settings.refresh')}</Button>}>
      {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} lg={6}><Statistic title={t('settings.usage.total')} value={usage?.total.total_tokens ?? 0} /></Col>
        <Col xs={12} lg={6}><Statistic title={t('settings.usage.input')} value={usage?.total.prompt_tokens ?? 0} /></Col>
        <Col xs={12} lg={6}><Statistic title={t('settings.usage.output')} value={usage?.total.completion_tokens ?? 0} /></Col>
        <Col xs={12} lg={6}><Statistic title={t('settings.usage.requests')} value={usage?.total.request_count ?? 0} /></Col>
      </Row>
      <Typography.Title level={5}>{t('settings.usage.trendTitle')}</Typography.Title>
      <UsageTrendChart items={usage?.items ?? []} />
      <Typography.Title level={5} style={{ marginTop: 20 }}>{t('settings.usage.byScenario')}</Typography.Title>
      <Table
        size="small"
        rowKey="session_type"
        pagination={false}
        dataSource={usage?.by_session_type ?? []}
        columns={[
          { title: t('settings.usage.scenario'), dataIndex: 'session_type' },
          { title: 'Token', dataIndex: 'total_tokens' },
          { title: t('settings.usage.requestCount'), dataIndex: 'request_count' },
        ]}
      />
      <Typography.Title level={5} style={{ marginTop: 20 }}>{t('settings.usage.byDay')}</Typography.Title>
      <Table
        size="small"
        rowKey="day"
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        dataSource={usage?.items ?? []}
        columns={[
          { title: t('settings.usage.dateUtc'), dataIndex: 'day' },
          { title: t('settings.usage.input'), dataIndex: 'prompt_tokens' },
          { title: t('settings.usage.output'), dataIndex: 'completion_tokens' },
          { title: t('settings.usage.total'), dataIndex: 'total_tokens' },
          { title: t('settings.usage.requestCount'), dataIndex: 'request_count' },
        ]}
      />
      <div style={{ marginTop: 20 }}>
        <UsageRecordsPanel />
      </div>
    </Card>
  );
}


export default function Settings() {
  const { t } = useLanguage();
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


  // Open the role editor.
  const openEdit = (agent?: AgentPreset) => {
    if (agent) {
      setEditingAgent(agent);
    } else {
      setEditingAgent(null);
    }
    setModalOpen(true);
  };

  // Save a role.
  const handleSave = async () => {
    const values = await formRef.current?.validateFields();
    if (!values) return;
    try {
      if (editingAgent) {
        await apiClient.put(`/agents/${editingAgent.id}`, values);
        message.success(t('settings.agents.updated'));
      } else {
        await apiClient.post('/agents', values);
        message.success(t('settings.agents.created'));
      }
      setModalOpen(false);
      loadAgents();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  // Delete a role.
  const handleDelete = async (id: number) => {
    try {
      await apiClient.delete(`/agents/${id}`);
      message.success(t('settings.agents.deleted'));
      loadAgents();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const columns = [
    { title: t('settings.agents.name'), dataIndex: 'name', key: 'name' },
    { title: t('settings.agents.key'), dataIndex: 'role_key', key: 'role_key' },
    { title: t('settings.agents.avatar'), dataIndex: 'avatar', key: 'avatar', width: 60 },
    { title: t('settings.agents.preset'), dataIndex: 'is_preset', key: 'is_preset', width: 80, render: (v: number) => t(v === 1 ? 'settings.agents.system' : 'settings.agents.user') },
    { title: 'System Prompt', dataIndex: 'system_prompt', key: 'system_prompt', ellipsis: true, render: (v: string) => v?.slice(0, 80) + '...' },
    { title: t('settings.actions'), key: 'actions', width: 160, render: (_: any, record: AgentPreset) => (
      <div style={{ display: 'flex', gap: 4 }}>
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>{t('settings.agents.edit')}</Button>
        <Popconfirm title={t('settings.agents.deleteConfirm')} onConfirm={() => handleDelete(record.id)}>
          <Button size="small" danger icon={<DeleteOutlined />}>{t('settings.delete')}</Button>
        </Popconfirm>
      </div>
    )},
  ];

  const tabItems = [
    {
      key: 'professional-preferences',
      label: t('settings.tabs.preferences'),
      children: <ProfessionalPreferencesPanel />,
    },
    {
      key: 'system',
      label: t('settings.tabs.system'),
      children: <SystemSettingsPanel />,
    },
    {
      key: 'credentials',
      label: t('settings.tabs.credentials'),
      children: <CredentialPanel />,
    },
    {
      key: 'mcp',
      label: t('settings.tabs.mcp'),
      children: <MCPServerSettingsPanel />,
    },
    {
      key: 'fundamentals-sources',
      label: t('settings.tabs.fundamentals'),
      children: <FundamentalsSourcePanel />,
    },
    {
      key: 'agents',
      label: t('settings.tabs.agents'),
      children: (
        <Card
          extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit()}>{t('settings.agents.add')}</Button>}
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
      label: t('settings.tabs.usage'),
      children: <UsagePanel />,
    },
    {
      key: 'scheduled-research',
      label: t('settings.tabs.scheduled'),
      children: <ScheduledResearchLinkagePanel />,
    },
    {
      key: 'product-metrics',
      label: t('settings.tabs.metrics'),
      children: <ProductMetricsPanel />,
    },
    {
      key: 'appearance',
      label: t('settings.tabs.appearance'),
      children: (
        <Card title={t('settings.appearance.title')}>
          <Typography.Text type="secondary">
            {t('settings.appearance.description')}
          </Typography.Text>
        </Card>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Tabs defaultActiveKey="system" items={tabItems} />

      {/* Role editor. */}
      <Modal
        title={t(editingAgent ? 'settings.agents.editTitle' : 'settings.agents.addTitle')}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText={t('settings.agents.save')}
        cancelText={t('settings.cancel')}
        width={600}
      >
        <Form ref={formRef} layout="vertical">
          <Form.Item name="name" label={t('settings.agents.roleName')} rules={[{ required: true }]}>
            <Input placeholder={t('settings.agents.roleNamePlaceholder')} />
          </Form.Item>
          <Form.Item name="role_key" label={t('settings.agents.roleKey')} rules={[{ required: true }]}>
            <Input placeholder="value_investor" disabled={!!editingAgent} />
          </Form.Item>
          <Form.Item name="avatar" label={t('settings.agents.avatar')}>
            <Input placeholder={t('settings.agents.avatarPlaceholder')} />
          </Form.Item>
          <Form.Item name="model_id" label={t('settings.agents.bindModel')}>
            <Select
              allowClear
              placeholder={t('settings.agents.noModel')}
              options={models.map((m) => ({ label: m.name, value: m.id }))}
            />
          </Form.Item>
          <Form.Item name="system_prompt" label="System Prompt" rules={[{ required: true }]}>
            <Input.TextArea rows={8} placeholder={t('settings.agents.promptPlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
