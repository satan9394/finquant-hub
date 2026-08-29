import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Button,
  Alert,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '../services/api';
import {
  createAlertRule,
  deleteAlertRule,
  fetchAlertRules,
  fetchAlertSignalTypes,
  fetchAlertTriggers,
  updateAlertRule,
} from '../services/alertApi';
import type {
  AlertDirection,
  AlertRule,
  AlertRuleInput,
  AlertTrigger,
  TriggerFilters,
} from '../services/alertApi';
import MonitorCard from '../components/MonitorCard';
import MonitorTypeChips, { MONITOR_TYPES, type MonitorType } from '../components/MonitorTypeChips';
import { useLanguage } from '../i18n/LanguageContext';

const SIGNAL_KEYS: Record<string, string> = {
  '*': 'alerts.signal.any',
  golden_cross: 'alerts.signal.golden_cross',
  death_cross: 'alerts.signal.death_cross',
  top_divergence: 'alerts.signal.top_divergence',
  bottom_divergence: 'alerts.signal.bottom_divergence',
  breakout_up: 'alerts.signal.breakout_up',
  breakout_down: 'alerts.signal.breakout_down',
  volume_surge: 'alerts.signal.volume_surge',
  rsi_oversold: 'alerts.signal.rsi_oversold',
  rsi_overbought: 'alerts.signal.rsi_overbought',
};

const DIRECTION_KEYS: Record<AlertDirection, string> = {
  bullish: 'alerts.direction.bullish',
  bearish: 'alerts.direction.bearish',
  neutral: 'alerts.direction.neutral',
};

const DIRECTION_COLORS: Record<AlertDirection, string> = {
  bullish: 'green',
  bearish: 'red',
  neutral: 'default',
};

const CONFIDENCE_KEYS = {
  high: 'alerts.confidence.high',
  medium: 'alerts.confidence.medium',
  low: 'alerts.confidence.low',
} as const;

function displayTicker(ticker: string) {
  if (ticker.startsWith('us')) return ticker.slice(2);
  if (ticker.startsWith('hk')) return `${ticker.slice(2)}.HK`;
  if (ticker.startsWith('sh') || ticker.startsWith('sz')) return ticker.slice(2);
  return ticker;
}

function monitorTypeForRule(rule: AlertRule): MonitorType {
  const value = `${rule.name} ${rule.signal_type}`.toLowerCase();
  if (/ipo|上市|招股/.test(value)) return 'ipo';
  if (/供应链|supply/.test(value)) return 'supply-chain';
  if (/thesis|论文|假设/.test(value)) return 'thesis';
  if (/filing|申报|问询|注册/.test(value)) return 'filing';
  if (/news|新闻|监管调查/.test(value)) return 'news';
  if (/estimate|预期|eps/.test(value)) return 'estimate';
  if (/fundamental|基本面|毛利率/.test(value)) return 'fundamental';
  if (/price|价格|跌破|突破/.test(value)) return 'price';
  if (/research|研究|定时/.test(value)) return 'agent-research';
  return 'technical';
}

function DirectionTag({ direction, label }: { direction: AlertDirection | null; label: string }) {
  return direction
    ? <Tag color={DIRECTION_COLORS[direction]}>{label}</Tag>
    : <Tag>{label}</Tag>;
}

export default function Alerts() {
  const { t } = useLanguage();
  const signalLabel = useCallback((value: string) => SIGNAL_KEYS[value] ? t(SIGNAL_KEYS[value]) : value, [t]);
  const directionLabels: Record<AlertDirection, string> = {
    bullish: t(DIRECTION_KEYS.bullish),
    bearish: t(DIRECTION_KEYS.bearish),
    neutral: t(DIRECTION_KEYS.neutral),
  };
  const [searchParams] = useSearchParams();
  const prefillTicker = searchParams.get('ticker')?.trim().toUpperCase() || '';
  const prefillName = searchParams.get('name')?.trim() || '';
  const sourceThesisId = Number(searchParams.get('thesis'));
  const genericTargetId = Number(searchParams.get('target'));
  const monitorTarget = Number.isInteger(sourceThesisId) && sourceThesisId > 0
    ? { target_type: 'thesis', target_id: sourceThesisId }
    : (['portfolio', 'strategy'].includes(searchParams.get('source') || '') && Number.isInteger(genericTargetId) && genericTargetId > 0
      ? { target_type: searchParams.get('source') as 'portfolio' | 'strategy', target_id: genericTargetId }
      : null);
  const portfolioSource = searchParams.get('source') === 'portfolio' ? {
    name: searchParams.get('portfolio')?.trim() || t('alerts.unnamedPortfolio'),
    metric: searchParams.get('metric')?.trim() || t('alerts.riskMetric'),
    value: searchParams.get('value')?.trim() || 'UNKNOWN',
    asOf: searchParams.get('as_of')?.trim() || 'UNKNOWN',
  } : null;
  const shouldPrefill = searchParams.get('new') === '1' && Boolean(prefillTicker);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [triggers, setTriggers] = useState<AlertTrigger[]>([]);
  const [signalTypes, setSignalTypes] = useState<string[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [triggersLoading, setTriggersLoading] = useState(false);
  const [runningRuleId, setRunningRuleId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [monitorDraft, setMonitorDraft] = useState<any>(null);
  const [triggerFilters, setTriggerFilters] = useState<TriggerFilters>({ limit: 50 });
  const [ruleForm] = Form.useForm<AlertRuleInput>();
  const [filterForm] = Form.useForm<TriggerFilters>();
  const requestedType = searchParams.get('type');
  const [monitorType, setMonitorType] = useState<MonitorType | 'all'>(MONITOR_TYPES.includes(requestedType as MonitorType) ? requestedType as MonitorType : 'all');

  const loadRules = useCallback(async () => {
    setRulesLoading(true);
    try {
      setRules(await fetchAlertRules());
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setRulesLoading(false);
    }
  }, []);

  const loadTriggers = useCallback(async (filters: TriggerFilters) => {
    setTriggersLoading(true);
    try {
      setTriggers(await fetchAlertTriggers(filters));
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setTriggersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRules();
    loadTriggers(triggerFilters);
    fetchAlertSignalTypes()
      .then(setSignalTypes)
      .catch((error: any) => message.error(error.message));
  }, [loadRules, loadTriggers]);

  useEffect(() => {
    if (shouldPrefill) {
      setEditingRule(null);
      setModalOpen(true);
    }
  }, [shouldPrefill]);

  const hydrateRuleForm = () => {
    if (editingRule) {
      ruleForm.setFieldsValue({
        name: editingRule.name,
        ticker: displayTicker(editingRule.ticker),
        signal_type: editingRule.signal_type,
        direction: editingRule.direction,
        is_enabled: editingRule.is_enabled,
      });
      return;
    }
    ruleForm.resetFields();
    ruleForm.setFieldsValue({ name: prefillName, ticker: prefillTicker, signal_type: monitorTarget ? undefined : '*', direction: null, is_enabled: true });
  };

  const openRuleModal = (rule?: AlertRule) => {
    setEditingRule(rule ?? null);
    setMonitorDraft(null);
    setModalOpen(true);
  };

  const saveRule = async () => {
    let values: AlertRuleInput;
    try {
      values = await ruleForm.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      const input = { ...values, direction: values.direction ?? null };
      if (editingRule) {
        await updateAlertRule(editingRule.id, input);
        message.success(t('alerts.message.updated'));
      } else if (monitorTarget) {
        const payload = {
          target_type: monitorTarget.target_type,
          target_id: monitorTarget.target_id,
          ticker: input.ticker,
          name: input.name,
          signal_type: input.signal_type,
          direction: input.direction,
        };
        if (!monitorDraft) {
          const response = await apiClient.post('/alerts/monitor-targets/draft', payload);
          setMonitorDraft(response.data);
          message.info(t('alerts.message.draftCreated'));
          return;
        }
        await apiClient.post('/alerts/monitor-targets/confirm', payload);
        message.success(t('alerts.message.monitorEnabled'));
      } else {
        await createAlertRule(input);
        message.success(t('alerts.message.created'));
      }
      setModalOpen(false);
      await loadRules();
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const removeRule = async (ruleId: number) => {
    try {
      await deleteAlertRule(ruleId);
      message.success(t('alerts.message.deleted'));
      await Promise.all([loadRules(), loadTriggers(triggerFilters)]);
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const toggleRule = async (rule: AlertRule, enabled: boolean) => {
    try {
      await updateAlertRule(rule.id, { is_enabled: enabled });
      setRules((current) => current.map((item) => (
        item.id === rule.id ? { ...item, is_enabled: enabled } : item
      )));
      message.success(t(enabled ? 'alerts.message.enabled' : 'alerts.message.disabled'));
    } catch (error: any) {
      message.error(error.message);
      await loadRules();
    }
  };

  const runRuleNow = async (rule: AlertRule) => {
    setRunningRuleId(rule.id);
    try {
      await apiClient.get(`/analysis/${encodeURIComponent(rule.ticker)}/indicators`);
      await loadTriggers(triggerFilters);
      message.success(t('alerts.message.checked', { ticker: displayTicker(rule.ticker) }));
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setRunningRuleId(null);
    }
  };

  const applyTriggerFilters = (values: TriggerFilters) => {
    const next = {
      rule_id: values.rule_id,
      ticker: values.ticker?.trim() || undefined,
      limit: values.limit ?? 50,
    };
    setTriggerFilters(next);
    loadTriggers(next);
  };

  const resetTriggerFilters = () => {
    const next = { limit: 50 };
    filterForm.resetFields();
    filterForm.setFieldsValue(next);
    setTriggerFilters(next);
    loadTriggers(next);
  };

  const enabledCount = useMemo(() => rules.filter((rule) => rule.is_enabled).length, [rules]);
  const monitorCards = useMemo(() => rules.map((rule) => {
    const related = triggers.filter((trigger) => trigger.rule_id === rule.id);
    const latest = related[0];
    return {
      id: rule.id,
            name: `Monitor · ${rule.name}`,
      type: monitorTypeForRule(rule),
      priority: null,
      state: rule.is_enabled ? 'RUNNING' : 'PAUSED',
      lastCheck: latest?.created_at ?? null,
      nextCheck: null,
      sources: null,
      changes: related.length,
      latestEvent: latest?.description ? `Event · ${latest.description}` : null,
      provider: null,
      rule,
    };
  }), [rules, triggers]);
  const visibleMonitors = monitorType === 'all' ? monitorCards : monitorCards.filter((monitor) => monitor.type === monitorType);

  const ruleColumns = [
    { title: t('alerts.column.name'), dataIndex: 'name', key: 'name', width: 180 },
    {
      title: t('alerts.column.ticker'), dataIndex: 'ticker', key: 'ticker', width: 120,
      render: (ticker: string) => <Link to={`/analysis/${ticker}`}>{displayTicker(ticker)}</Link>,
    },
    {
      title: t('alerts.column.technicalSignal'), dataIndex: 'signal_type', key: 'signal_type', width: 150,
      render: (value: string) => signalLabel(value),
    },
    {
      title: t('alerts.column.direction'), dataIndex: 'direction', key: 'direction', width: 110,
      render: (value: AlertDirection | null) => <DirectionTag direction={value} label={value ? directionLabels[value] : t('alerts.direction.any')} />,
    },
    {
      title: t('alerts.column.enabled'), dataIndex: 'is_enabled', key: 'is_enabled', width: 90,
      render: (enabled: boolean, rule: AlertRule) => (
        <Switch
          checked={enabled}
          aria-label={t('alerts.enabledAria', { name: rule.name })}
          onChange={(checked) => toggleRule(rule, checked)}
        />
      ),
    },
    {
      title: t('alerts.column.updatedAt'), dataIndex: 'updated_at', key: 'updated_at', width: 170,
      render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: t('alerts.column.actions'), key: 'actions', width: 150, fixed: 'right' as const,
      render: (_: unknown, rule: AlertRule) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => openRuleModal(rule)}>{t('alerts.edit')}</Button>
          <Popconfirm
            title={t('alerts.deleteConfirm')}
            description={t('alerts.deleteDescription')}
            okText={t('alerts.delete')}
            cancelText={t('alerts.cancel')}
            onConfirm={() => removeRule(rule.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} aria-label={t('alerts.deleteAria', { name: rule.name })} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const triggerColumns = [
    {
      title: t('alerts.column.triggeredAt'), dataIndex: 'created_at', key: 'created_at', width: 170,
      render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
    },
    { title: t('alerts.column.rule'), dataIndex: 'rule_name', key: 'rule_name', width: 180 },
    {
      title: t('alerts.column.ticker'), dataIndex: 'ticker', key: 'ticker', width: 110,
      render: (ticker: string) => <Link to={`/analysis/${ticker}`}>{displayTicker(ticker)}</Link>,
    },
    {
      title: t('alerts.column.signal'), dataIndex: 'signal_type', key: 'signal_type', width: 140,
      render: (value: string) => signalLabel(value),
    },
    {
      title: t('alerts.column.direction'), dataIndex: 'direction', key: 'direction', width: 90,
      render: (value: AlertDirection) => <DirectionTag direction={value} label={directionLabels[value]} />,
    },
    {
      title: t('alerts.column.confidence'), dataIndex: 'confidence', key: 'confidence', width: 100,
      render: (value: AlertTrigger['confidence']) => value ? t(CONFIDENCE_KEYS[value]) : '—',
    },
    { title: t('alerts.column.description'), dataIndex: 'description', key: 'description', ellipsis: true },
  ];

  const ruleTab = (
    <Card
      title={t('alerts.rulesTitle')}
      extra={(
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadRules}>{t('alerts.refresh')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openRuleModal()}>{t('alerts.add')}</Button>
        </Space>
      )}
    >
      <Table
        rowKey="id"
        dataSource={rules}
        columns={ruleColumns}
        loading={rulesLoading}
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        scroll={{ x: 980 }}
        locale={{ emptyText: <Empty description={t('alerts.noRules')} /> }}
      />
    </Card>
  );

  const historyTab = (
    <Card title={t('alerts.historyTitle')}>
      <Form
        form={filterForm}
        layout="inline"
        initialValues={{ limit: 50 }}
        onFinish={applyTriggerFilters}
        style={{ marginBottom: 20, rowGap: 12 }}
      >
        <Form.Item name="rule_id" label={t('alerts.column.rule')}>
          <Select
            allowClear
            placeholder={t('alerts.allRules')}
            style={{ width: 180 }}
            options={rules.map((rule) => ({ label: rule.name, value: rule.id }))}
          />
        </Form.Item>
        <Form.Item name="ticker" label={t('alerts.column.ticker')}>
          <Input allowClear placeholder="AAPL / 600519" style={{ width: 170 }} />
        </Form.Item>
        <Form.Item name="limit" label={t('alerts.limit')}>
          <InputNumber min={1} max={100} style={{ width: 100 }} />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>{t('alerts.search')}</Button>
            <Button onClick={resetTriggerFilters}>{t('alerts.reset')}</Button>
            <Button icon={<ReloadOutlined />} onClick={() => loadTriggers(triggerFilters)}>{t('alerts.refresh')}</Button>
          </Space>
        </Form.Item>
      </Form>
      <Table
        rowKey="id"
        dataSource={triggers}
        columns={triggerColumns}
        loading={triggersLoading}
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        scroll={{ x: 1050 }}
        locale={{ emptyText: <Empty description={t('alerts.noTriggers')} /> }}
      />
    </Card>
  );

  return (
    <div className="monitor-workspace">
      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        <div>
          <Typography.Text className="eyebrow">{t('monitor.eyebrow')}</Typography.Text>
          <Typography.Title level={2} style={{ marginBottom: 4 }}>{t('alerts.title')}</Typography.Title>
          <Typography.Text type="secondary">{t('alerts.description')}</Typography.Text>
        </div>
        <MonitorTypeChips selected={monitorType} onChange={setMonitorType} />
        <div className="monitor-grid">
          {visibleMonitors.length ? visibleMonitors.map((monitor) => (
            <MonitorCard
              key={monitor.id}
              monitor={monitor}
              onInspect={() => { const next = { rule_id: Number(monitor.id), limit: 50 }; setTriggerFilters(next); void loadTriggers(next); }}
              onRunNow={monitor.rule.is_enabled ? () => void runRuleNow(monitor.rule) : undefined}
              runNowLoading={runningRuleId === monitor.rule.id}
              onEdit={() => openRuleModal(monitor.rule)}
            />
          )) : <Empty description={t('alerts.noTypeRules')} />}
        </div>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}><Card><Statistic title={t('alerts.totalRules')} value={rules.length} /></Card></Col>
          <Col xs={24} sm={8}><Card><Statistic title={t('alerts.enabledRules')} value={enabledCount} /></Card></Col>
          <Col xs={24} sm={8}><Card><Statistic title={t('alerts.currentHistory')} value={triggers.length} /></Card></Col>
        </Row>
        <Tabs
          items={[
            { key: 'rules', label: t('alerts.manageRules'), children: ruleTab },
            { key: 'history', label: t('alerts.historyTitle'), children: historyTab },
          ]}
        />
      </Space>

      <Modal
        title={t(editingRule ? 'alerts.editTitle' : 'alerts.addTitle')}
        open={modalOpen}
        confirmLoading={saving}
        okText={t(monitorDraft ? 'alerts.confirmEnable' : monitorTarget ? 'alerts.generateDraft' : 'alerts.save')}
        cancelText={t('alerts.cancel')}
        onOk={saveRule}
        onCancel={() => { setModalOpen(false); setMonitorDraft(null); }}
        afterOpenChange={(open) => { if (open) hydrateRuleForm(); }}
        destroyOnHidden
      >
        {monitorDraft ? (
          <Alert
            type="warning"
            showIcon
            message={t('alerts.draftTitle')}
            description={t('alerts.draftDescription', { title: monitorDraft.target.title, signal: signalLabel(monitorDraft.condition.signal_type), source: monitorDraft.condition.source, quality: monitorDraft.condition.quality_status, boundary: monitorDraft.execution_boundary })}
            style={{ marginBottom: 12 }}
          />
        ) : null}
        {Number.isInteger(sourceThesisId) && sourceThesisId > 0 ? (
          <Alert
            type="info"
            showIcon
            message={<>{t('alerts.source')}<Link to={`/thesis?id=${sourceThesisId}`}>{t('alerts.thesis', { id: sourceThesisId })}</Link></>}
            description={t('alerts.thesisDescription')}
            style={{ marginBottom: 12 }}
          />
        ) : null}
        {portfolioSource ? (
          <Alert
            type="warning"
            showIcon
            message={t('alerts.portfolioSource', { name: portfolioSource.name })}
            description={t('alerts.portfolioDescription', { metric: portfolioSource.metric === 'concentration' ? t('alerts.concentration') : portfolioSource.metric, value: portfolioSource.value, asOf: portfolioSource.asOf })}
            style={{ marginBottom: 12 }}
          />
        ) : null}
        <Form
          key={editingRule ? `edit-${editingRule.id}` : 'new'}
          form={ruleForm}
          layout="vertical"
          clearOnDestroy
          initialValues={editingRule ? {
            name: editingRule.name,
            ticker: displayTicker(editingRule.ticker),
            signal_type: editingRule.signal_type,
            direction: editingRule.direction,
            is_enabled: editingRule.is_enabled,
          } : {
            name: prefillName,
            ticker: prefillTicker,
            signal_type: '*',
            direction: null,
            is_enabled: true,
          }}
        >
          <Form.Item name="name" label={t('alerts.column.name')} rules={[{ required: true, whitespace: true, message: t('alerts.nameRequired') }]}>
            <Input maxLength={100} placeholder={t('alerts.namePlaceholder')} />
          </Form.Item>
          <Form.Item name="ticker" label={t('alerts.ticker')} rules={[{ required: true, whitespace: true, message: t('alerts.tickerRequired') }]}>
            <Input maxLength={20} placeholder="AAPL / 600519 / 0700.HK" />
          </Form.Item>
          <Form.Item name="signal_type" label={t('alerts.column.technicalSignal')} rules={[{ required: true, message: t('alerts.signalRequired') }]}>
            <Select options={signalTypes.map((value) => ({ label: signalLabel(value), value }))} />
          </Form.Item>
          <Form.Item name="direction" label={t('alerts.column.direction')}>
            <Select
              allowClear
              placeholder={t('alerts.direction.any')}
              options={Object.entries(directionLabels).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Form.Item name="is_enabled" label={t('alerts.enableNow')} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
