import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
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

const SIGNAL_LABELS: Record<string, string> = {
  '*': '任意技术信号',
  golden_cross: '均线金叉',
  death_cross: '均线死叉',
  top_divergence: '顶背离',
  bottom_divergence: '底背离',
  breakout_up: '向上突破',
  breakout_down: '向下突破',
  volume_surge: '成交量放大',
  rsi_oversold: 'RSI 超卖',
  rsi_overbought: 'RSI 超买',
};

const DIRECTION_LABELS: Record<AlertDirection, string> = {
  bullish: '看涨',
  bearish: '看跌',
  neutral: '中性',
};

const DIRECTION_COLORS: Record<AlertDirection, string> = {
  bullish: 'green',
  bearish: 'red',
  neutral: 'default',
};

const CONFIDENCE_LABELS = {
  high: '高',
  medium: '中',
  low: '低',
} as const;

function signalLabel(value: string) {
  return SIGNAL_LABELS[value] ?? value;
}

function displayTicker(ticker: string) {
  if (ticker.startsWith('us')) return ticker.slice(2);
  if (ticker.startsWith('hk')) return `${ticker.slice(2)}.HK`;
  if (ticker.startsWith('sh') || ticker.startsWith('sz')) return ticker.slice(2);
  return ticker;
}

function DirectionTag({ direction }: { direction: AlertDirection | null }) {
  return direction
    ? <Tag color={DIRECTION_COLORS[direction]}>{DIRECTION_LABELS[direction]}</Tag>
    : <Tag>任意方向</Tag>;
}

export default function Alerts() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [triggers, setTriggers] = useState<AlertTrigger[]>([]);
  const [signalTypes, setSignalTypes] = useState<string[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [triggersLoading, setTriggersLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [triggerFilters, setTriggerFilters] = useState<TriggerFilters>({ limit: 50 });
  const [ruleForm] = Form.useForm<AlertRuleInput>();
  const [filterForm] = Form.useForm<TriggerFilters>();

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
    ruleForm.setFieldsValue({ signal_type: '*', direction: null, is_enabled: true });
  };

  const openRuleModal = (rule?: AlertRule) => {
    setEditingRule(rule ?? null);
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
        message.success('预警规则已更新');
      } else {
        await createAlertRule(input);
        message.success('预警规则已创建');
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
      message.success('预警规则已删除，历史触发记录仍会保留');
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
      message.success(enabled ? '规则已启用' : '规则已停用');
    } catch (error: any) {
      message.error(error.message);
      await loadRules();
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

  const ruleColumns = [
    { title: '规则名称', dataIndex: 'name', key: 'name', width: 180 },
    {
      title: '标的', dataIndex: 'ticker', key: 'ticker', width: 120,
      render: (ticker: string) => <Link to={`/analysis/${ticker}`}>{displayTicker(ticker)}</Link>,
    },
    {
      title: '技术信号', dataIndex: 'signal_type', key: 'signal_type', width: 150,
      render: (value: string) => signalLabel(value),
    },
    {
      title: '方向', dataIndex: 'direction', key: 'direction', width: 110,
      render: (value: AlertDirection | null) => <DirectionTag direction={value} />,
    },
    {
      title: '启用', dataIndex: 'is_enabled', key: 'is_enabled', width: 90,
      render: (enabled: boolean, rule: AlertRule) => (
        <Switch
          checked={enabled}
          aria-label={`${rule.name}启用状态`}
          onChange={(checked) => toggleRule(rule, checked)}
        />
      ),
    },
    {
      title: '更新时间', dataIndex: 'updated_at', key: 'updated_at', width: 170,
      render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作', key: 'actions', width: 150, fixed: 'right' as const,
      render: (_: unknown, rule: AlertRule) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => openRuleModal(rule)}>编辑</Button>
          <Popconfirm
            title="删除这条预警规则？"
            description="已有触发历史将继续保留。"
            okText="删除"
            cancelText="取消"
            onConfirm={() => removeRule(rule.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} aria-label={`删除${rule.name}`} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const triggerColumns = [
    {
      title: '触发时间', dataIndex: 'created_at', key: 'created_at', width: 170,
      render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
    },
    { title: '规则', dataIndex: 'rule_name', key: 'rule_name', width: 180 },
    {
      title: '标的', dataIndex: 'ticker', key: 'ticker', width: 110,
      render: (ticker: string) => <Link to={`/analysis/${ticker}`}>{displayTicker(ticker)}</Link>,
    },
    {
      title: '信号', dataIndex: 'signal_type', key: 'signal_type', width: 140,
      render: (value: string) => signalLabel(value),
    },
    {
      title: '方向', dataIndex: 'direction', key: 'direction', width: 90,
      render: (value: AlertDirection) => <DirectionTag direction={value} />,
    },
    {
      title: '置信度', dataIndex: 'confidence', key: 'confidence', width: 100,
      render: (value: AlertTrigger['confidence']) => value ? CONFIDENCE_LABELS[value] : '—',
    },
    { title: '说明', dataIndex: 'description', key: 'description', ellipsis: true },
  ];

  const ruleTab = (
    <Card
      title="预警规则"
      extra={(
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadRules}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openRuleModal()}>新增规则</Button>
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
        locale={{ emptyText: <Empty description="暂无预警规则" /> }}
      />
    </Card>
  );

  const historyTab = (
    <Card title="触发历史">
      <Form
        form={filterForm}
        layout="inline"
        initialValues={{ limit: 50 }}
        onFinish={applyTriggerFilters}
        style={{ marginBottom: 20, rowGap: 12 }}
      >
        <Form.Item name="rule_id" label="规则">
          <Select
            allowClear
            placeholder="全部规则"
            style={{ width: 180 }}
            options={rules.map((rule) => ({ label: rule.name, value: rule.id }))}
          />
        </Form.Item>
        <Form.Item name="ticker" label="标的">
          <Input allowClear placeholder="AAPL / 600519" style={{ width: 170 }} />
        </Form.Item>
        <Form.Item name="limit" label="条数">
          <InputNumber min={1} max={100} style={{ width: 100 }} />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>查询</Button>
            <Button onClick={resetTriggerFilters}>重置</Button>
            <Button icon={<ReloadOutlined />} onClick={() => loadTriggers(triggerFilters)}>刷新</Button>
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
        locale={{ emptyText: <Empty description="暂无触发记录" /> }}
      />
    </Card>
  );

  return (
    <div style={{ padding: 24 }}>
      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        <div>
          <Typography.Title level={2} style={{ marginBottom: 4 }}>预警中心</Typography.Title>
          <Typography.Text type="secondary">管理技术信号规则，查看调度扫描产生的历史触发记录。</Typography.Text>
        </div>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}><Card><Statistic title="规则总数" value={rules.length} /></Card></Col>
          <Col xs={24} sm={8}><Card><Statistic title="已启用" value={enabledCount} /></Card></Col>
          <Col xs={24} sm={8}><Card><Statistic title="当前历史记录" value={triggers.length} /></Card></Col>
        </Row>
        <Tabs
          items={[
            { key: 'rules', label: '规则管理', children: ruleTab },
            { key: 'history', label: '触发历史', children: historyTab },
          ]}
        />
      </Space>

      <Modal
        title={editingRule ? '编辑预警规则' : '新增预警规则'}
        open={modalOpen}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        onOk={saveRule}
        onCancel={() => setModalOpen(false)}
        afterOpenChange={(open) => { if (open) hydrateRuleForm(); }}
        destroyOnHidden
      >
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
            signal_type: '*',
            direction: null,
            is_enabled: true,
          }}
        >
          <Form.Item name="name" label="规则名称" rules={[{ required: true, whitespace: true, message: '请输入规则名称' }]}>
            <Input maxLength={100} placeholder="例如：苹果均线金叉" />
          </Form.Item>
          <Form.Item name="ticker" label="股票代码" rules={[{ required: true, whitespace: true, message: '请输入股票代码' }]}>
            <Input maxLength={20} placeholder="AAPL / 600519 / 0700.HK" />
          </Form.Item>
          <Form.Item name="signal_type" label="技术信号" rules={[{ required: true, message: '请选择技术信号' }]}>
            <Select options={signalTypes.map((value) => ({ label: signalLabel(value), value }))} />
          </Form.Item>
          <Form.Item name="direction" label="方向">
            <Select
              allowClear
              placeholder="任意方向"
              options={Object.entries(DIRECTION_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Form.Item name="is_enabled" label="立即启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
