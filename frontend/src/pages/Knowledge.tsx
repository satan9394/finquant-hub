/* ============================================================
 * Knowledge — 策略知识库页
 * ============================================================ */
import { useState } from 'react';
import { Layout, Menu, Typography } from 'antd';
import { BookOutlined } from '@ant-design/icons';

const { Sider, Content } = Layout;
const { Title } = Typography;

const strategies = [
  { key: 'm1', label: '双均线策略', file: 'm1-移动平均策略.html' },
  { key: 'm2', label: '均值回归策略', file: 'm2-均值回归策略.html' },
  { key: 'm3', label: '动量策略', file: 'm3-动量策略.html' },
  { key: 'm4', label: '市场中性策略', file: 'm4-市场中性策略.html' },
  { key: 'm5', label: '统计套利策略', file: 'm5-统计套利策略.html' },
  { key: 'm6', label: '事件驱动策略', file: 'm6-事件驱动策略.html' },
  { key: 'm7', label: '机器学习策略', file: 'm7-机器学习策略.html' },
  { key: 'm8', label: '高频交易策略', file: 'm8-高频交易策略.html' },
];

export default function Knowledge() {
  const [selectedKey, setSelectedKey] = useState(strategies[0].key);
  const current = strategies.find((s) => s.key === selectedKey);

  return (
    <Layout style={{ height: 'calc(100vh - 56px)', background: '#fff' }}>
      {/* 左栏：策略列表 */}
      <Sider width={220} style={{ background: '#fafafa', borderRight: '1px solid #f0f0f0', overflow: 'auto' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
          <Title level={5} style={{ margin: 0 }}>
            <BookOutlined /> 策略知识库
          </Title>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          onClick={({ key }) => setSelectedKey(key)}
          style={{ borderRight: 0, background: 'transparent' }}
          items={strategies.map((s) => ({
            key: s.key,
            icon: <BookOutlined />,
            label: s.label,
          }))}
        />
      </Sider>

      {/* 内容：iframe 渲染 HTML */}
      <Content style={{ padding: 16, overflow: 'auto' }}>
        {current && (
          <iframe
            src={`/knowledge/${current.file}`}
            style={{ width: '100%', height: '100%', border: 'none' }}
            title={current.label}
          />
        )}
      </Content>
    </Layout>
  );
}
