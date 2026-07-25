import { useState } from 'react';
import { Alert, Button, Card, Input, Table, Tag, Typography, message } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import apiClient from '../services/api';

const { Title, Text } = Typography;

type ScreenedStock = {
  ticker: string; name: string; price: number; change_percent: number;
  return_60d_pct: number; signal: string;
};

export default function Screening() {
  const [input, setInput] = useState('600519, 00700, AAPL, SPY');
  const [items, setItems] = useState<ScreenedStock[]>([]);
  const [errors, setErrors] = useState<{ ticker: string; error: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const runScreen = async () => {
    const tickers = input.split(/[，,\n\s]+/).filter(Boolean);
    if (!tickers.length) { message.warning('请输入至少一个股票代码'); return; }
    setLoading(true);
    try {
      const res = await apiClient.post('/screening', { tickers });
      setItems(res.data.items ?? []);
      setErrors(res.data.errors ?? []);
    } catch (error: any) {
      message.error(error.response?.data?.detail || '选股请求失败');
    } finally { setLoading(false); }
  };

  return <div style={{ padding: 24, maxWidth: 1120, margin: '0 auto' }}>
    <Title level={4}>自定义选股器</Title>
    <Text type="secondary">输入任意 A 股、港股、美股或 ETF 代码，系统以真实行情与近 60 根日线按动量排序。</Text>
    <Card size="small" style={{ marginTop: 16, marginBottom: 16 }}>
      <Input.TextArea value={input} onChange={(event) => setInput(event.target.value)} rows={3}
        placeholder="例如：600519, 00700, AAPL, BRK.B, SPY" />
      <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={runScreen} style={{ marginTop: 12 }}>开始筛选</Button>
    </Card>
    {errors.length > 0 && <Alert type="warning" showIcon style={{ marginBottom: 16 }}
      message={`以下代码未能查询：${errors.map((item) => item.ticker).join('、')}`} />}
    <Table rowKey="ticker" dataSource={items} loading={loading} pagination={false} size="small"
      columns={[
        { title: '代码', dataIndex: 'ticker', render: (value: string) => <Text code>{value}</Text> },
        { title: '名称', dataIndex: 'name' },
        { title: '现价', dataIndex: 'price', align: 'right' as const, render: (value: number) => value.toFixed(2) },
        { title: '当日涨跌', dataIndex: 'change_percent', align: 'right' as const, render: (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%` },
        { title: '60 日收益', dataIndex: 'return_60d_pct', align: 'right' as const, render: (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%` },
        { title: '信号', dataIndex: 'signal', render: (value: string) => <Tag color={value === '动量偏强' ? 'red' : value === '动量偏弱' ? 'green' : 'default'}>{value}</Tag> },
      ]} />
  </div>;
}
