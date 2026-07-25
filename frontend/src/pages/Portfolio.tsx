/* ============================================================
 * Portfolio — 投资组合页（/portfolio）
 * 功能：分组标签 + 汇总卡片 + 持仓表格 + 配置分布 + 增/改弹窗
 * ============================================================ */
import { useEffect, useState, useCallback } from 'react';
import {
  Card, Row, Col, Table, Tabs, Button, Modal, Form, Input, InputNumber, Statistic, Typography, message, Empty, Popconfirm, Spin, Progress,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined,
} from '@ant-design/icons';
import {
  fetchPortfolioGroups, fetchPortfolioSummary, fetchPortfolioHoldings,
  fetchPortfolioAllocation, addPortfolioHolding, updatePortfolioHolding, deletePortfolioHolding,
} from '../services/analysisApi';
import type { PortfolioGroup, PortfolioSummary, PortfolioHolding, PortfolioAllocation } from '../types';

const { Title, Text } = Typography;

// ==================== 颜色辅助 ====================
const profitColor = (v?: number) => (v != null ? (v >= 0 ? '#f23645' : '#089981') : '#666');
const profitPrefix = (v?: number) => (v != null ? (v >= 0 ? '+' : '') : '');

// ==================== 页面组件 ====================
export default function Portfolio() {
  // 数据
  const [groups, setGroups] = useState<PortfolioGroup[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [allocation, setAllocation] = useState<PortfolioAllocation[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);

  // 状态
  const [loading, setLoading] = useState(true);
  const [holdingLoading, setHoldingLoading] = useState(false);

  // 弹窗
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState<PortfolioHolding | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [form] = Form.useForm();

  // ---------- 加载分组 ----------
  const loadGroups = useCallback(async () => {
    try {
      const g = await fetchPortfolioGroups();
      setGroups(g);
      if (g.length > 0 && activeGroupId == null) {
        setActiveGroupId(g[0].id);
      }
    } catch { /* ignore */ }
  }, [activeGroupId]);

  // ---------- 加载汇总 ----------
  const loadSummary = useCallback(async () => {
    try {
      const s = await fetchPortfolioSummary();
      setSummary(s);
    } catch { /* ignore */ }
  }, []);

  // ---------- 加载持仓 ----------
  const loadHoldings = useCallback(async (groupId?: number) => {
    setHoldingLoading(true);
    try {
      const h = await fetchPortfolioHoldings(groupId);
      setHoldings(h);
    } catch { /* ignore */ }
    finally { setHoldingLoading(false); }
  }, []);

  // ---------- 加载配置 ----------
  const loadAllocation = useCallback(async () => {
    try {
      const a = await fetchPortfolioAllocation();
      setAllocation(a);
    } catch { /* ignore */ }
  }, []);

  // ---------- 首次加载 ----------
  useEffect(() => {
    setLoading(true);
    Promise.all([loadGroups(), loadSummary(), loadAllocation()])
      .finally(() => setLoading(false));
  }, [loadGroups, loadSummary, loadAllocation]);

  // ---------- 切换分组 ----------
  useEffect(() => {
    if (activeGroupId != null) loadHoldings(activeGroupId);
  }, [activeGroupId, loadHoldings]);

  // ---------- 新建/编辑持仓 ----------
  const openAddModal = () => {
    setEditingHolding(null);
    form.resetFields();
    form.setFieldsValue({ group_id: activeGroupId ?? groups[0]?.id });
    setModalOpen(true);
  };

  const openEditModal = (holding: PortfolioHolding) => {
    setEditingHolding(holding);
    form.setFieldsValue({
      group_id: holding.group_id,
      code: holding.code,
      name: holding.name,
      shares: holding.shares,
      cost_price: holding.cost_price,
    });
    setModalOpen(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      setModalLoading(true);
      if (editingHolding) {
        await updatePortfolioHolding(editingHolding.id, values);
        message.success('持仓已更新');
      } else {
        await addPortfolioHolding(values);
        message.success('持仓已添加');
      }
      setModalOpen(false);
      loadHoldings(activeGroupId ?? undefined);
      loadSummary();
      loadAllocation();
    } catch (err: any) {
      if (err.message) message.error(err.message);
    } finally {
      setModalLoading(false);
    }
  };

  // ---------- 删除持仓 ----------
  const handleDelete = async (id: number) => {
    try {
      await deletePortfolioHolding(id);
      message.success('已删除');
      loadHoldings(activeGroupId ?? undefined);
      loadSummary();
      loadAllocation();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  // ---------- 汇总卡片 ----------
  const summaryCards = summary ? [
    { title: '总投入', value: summary.total_invested, prefix: '¥', precision: 2, color: '#1890ff' },
    { title: '当前市值', value: summary.total_current, prefix: '¥', precision: 2, color: '#722ed1' },
    { title: '总盈亏', value: summary.total_profit, prefix: '¥', precision: 2, color: profitColor(summary.total_profit) },
    { title: '收益率', value: summary.total_profit_percent, suffix: '%', precision: 2, color: profitColor(summary.total_profit_percent) },
  ] : [];

  // ---------- 持仓表格列 ----------
  const columns = [
    { title: '代码', dataIndex: 'code', key: 'code', width: 90, render: (v: string) => <Text code>{v}</Text> },
    { title: '名称', dataIndex: 'name', key: 'name', width: 100 },
    { title: '持仓数量', dataIndex: 'shares', key: 'shares', width: 100, align: 'right' as const, render: (v: number) => v.toLocaleString() },
    { title: '成本价', dataIndex: 'cost_price', key: 'cost_price', width: 100, align: 'right' as const, render: (v: number) => `¥${v.toFixed(2)}` },
    { title: '现价', dataIndex: 'current_price', key: 'current_price', width: 100, align: 'right' as const, render: (v?: number) => v != null ? `¥${v.toFixed(2)}` : '--' },
    {
      title: '盈亏', dataIndex: 'profit', key: 'profit', width: 120, align: 'right' as const,
      render: (_: any, record: PortfolioHolding) => {
        const p = record.profit;
        const pp = record.profit_percent;
        return (
          <span style={{ color: profitColor(p), fontWeight: 600 }}>
            {p != null ? `${profitPrefix(p)}¥${p.toFixed(2)}` : '--'}
            {pp != null ? ` (${profitPrefix(pp)}${pp.toFixed(2)}%)` : ''}
          </span>
        );
      },
      sorter: (a: PortfolioHolding, b: PortfolioHolding) => (a.profit ?? 0) - (b.profit ?? 0),
    },
    {
      title: '操作', key: 'action', width: 100,
      render: (_: any, record: PortfolioHolding) => (
        <span>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>编辑</Button>
          <Popconfirm title="确认删除此持仓？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </span>
      ),
    },
  ];

  // ==================== 渲染 ====================
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>投资组合</Title>
        <Button icon={<ReloadOutlined />} onClick={() => { loadSummary(); loadHoldings(activeGroupId ?? undefined); loadAllocation(); }}>
          刷新
        </Button>
      </div>

      {/* 汇总卡片 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {summaryCards.map((card) => (
          <Col xs={12} sm={6} key={card.title}>
            <Card size="small" hoverable>
              <Statistic
                title={card.title}
                value={card.value}
                precision={card.precision}
                prefix={<span style={{ color: card.color }}>{card.prefix}</span>}
                suffix={card.suffix}
                valueStyle={{ color: card.color, fontFamily: 'monospace' }}
              />
            </Card>
          </Col>
        ))}
        {!summary && [1, 2, 3, 4].map((i) => (
          <Col xs={12} sm={6} key={i}>
            <Card size="small"><Statistic title="加载中..." value={0} loading /></Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        {/* 持仓列表 */}
        <Col xs={24} lg={16}>
          <Card
            size="small"
            title={
              <Tabs
                size="small"
                activeKey={String(activeGroupId ?? '')}
                onChange={(key) => setActiveGroupId(Number(key))}
                items={groups.map((g) => ({ key: String(g.id), label: g.name }))}
                style={{ marginBottom: 0 }}
              />
            }
            extra={
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openAddModal}>
                添加持仓
              </Button>
            }
          >
            <Table
              dataSource={holdings}
              columns={columns}
              rowKey="id"
              size="small"
              loading={holdingLoading}
              pagination={false}
              locale={{ emptyText: <Empty description="暂无持仓" /> }}
              scroll={{ x: 700 }}
            />
          </Card>
        </Col>

        {/* 配置分布 */}
        <Col xs={24} lg={8}>
          <Card size="small" title="资产配置分布">
            {allocation.length > 0 ? (
              <div style={{ padding: '4px 0' }}>
                {allocation.map((alloc) => (
                  <div key={alloc.group_id} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text strong style={{ fontSize: 13 }}>{alloc.group_name}</Text>
                      <Text style={{ fontSize: 12, color: '#888' }}>{(alloc.weight * 100).toFixed(1)}%</Text>
                    </div>
                    <Progress percent={Math.round(alloc.weight * 100)} size="small" strokeColor="#722ed1" showInfo={false} />
                    {alloc.items?.map((item) => (
                      <div key={item.code ?? item.name} style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 16, fontSize: 12, marginTop: 2 }}>
                        <span>{item.name}</span>
                        <span style={{ color: '#888' }}>{(item.weight * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <Empty description="暂无配置数据" />
            )}
          </Card>
        </Col>
      </Row>

      {/* 添加/编辑弹窗 */}
      <Modal
        title={editingHolding ? '编辑持仓' : '添加持仓'}
        open={modalOpen}
        onOk={handleModalOk}
        onCancel={() => setModalOpen(false)}
        confirmLoading={modalLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="group_id" label="所属分组" rules={[{ required: true, message: '请选择分组' }]}>
            <InputNumber style={{ width: '100%' }} disabled={!!editingHolding} />
          </Form.Item>
          <Form.Item name="code" label="股票代码" rules={[{ required: true, message: '请输入股票代码' }]}>
            <Input placeholder="如 600519" disabled={!!editingHolding} />
          </Form.Item>
          <Form.Item name="name" label="股票名称" rules={[{ required: true, message: '请输入股票名称' }]}>
            <Input placeholder="如 贵州茅台" disabled={!!editingHolding} />
          </Form.Item>
          <Form.Item name="shares" label="持仓数量" rules={[{ required: true, message: '请输入持仓数量' }]}>
            <InputNumber style={{ width: '100%' }} min={0} precision={0} placeholder="股数" />
          </Form.Item>
          <Form.Item name="cost_price" label="持仓成本价" rules={[{ required: true, message: '请输入成本价' }]}>
            <InputNumber style={{ width: '100%' }} min={0} precision={2} addonBefore="¥" placeholder="每股成本" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 免责声明 */}
      <div style={{ textAlign: 'center', fontSize: 11, color: '#bbb', marginTop: 24 }}>
        此内容由 AI 生成，不构成投资建议
      </div>
    </div>
  );
}
