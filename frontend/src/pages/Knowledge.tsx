import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Menu, Typography } from 'antd';
import { BookOutlined, ExperimentOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

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
  const [frameHeight, setFrameHeight] = useState(1100);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const navigate = useNavigate();
  const current = strategies.find((strategy) => strategy.key === selectedKey)!;

  const resizeFrame = useCallback(() => {
    const documentHeight = iframeRef.current?.contentDocument?.documentElement.scrollHeight;
    if (documentHeight) setFrameHeight(Math.max(680, documentHeight + 24));
  }, []);

  return (
    <main className="product-page">
      <div className="knowledge-shell surface-card">
        <aside className="knowledge-nav">
          <div style={{ padding: '16px', borderBottom: '1px solid #eef1f5' }}>
            <Title level={5} style={{ margin: 0 }}><BookOutlined /> 策略知识库</Title>
          </div>
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            onClick={({ key }) => setSelectedKey(key)}
            style={{ borderRight: 0, background: 'transparent' }}
            items={strategies.map((strategy) => ({ key: strategy.key, icon: <BookOutlined />, label: strategy.label }))}
          />
        </aside>
        <section className="knowledge-content">
          <div className="knowledge-toolbar">
            <div>
              <Text className="eyebrow">KNOWLEDGE · TEACHING DEMO</Text>
              <Title level={4} style={{ margin: '4px 0' }}>{current.label}</Title>
              <Text type="secondary">文章内随机曲线仅用于教学示意，不作为研究或回测数据。</Text>
            </div>
            {selectedKey === 'm1' && (
              <Button type="primary" icon={<ExperimentOutlined />} onClick={() => navigate('/strategy-lab/ma-crossover')}>
                在策略实验室打开
              </Button>
            )}
          </div>
          <iframe
            ref={iframeRef}
            src={`/knowledge/${current.file}`}
            style={{ width: '100%', height: frameHeight, border: 0, display: 'block' }}
            title={current.label}
            scrolling="no"
            onLoad={resizeFrame}
          />
        </section>
      </div>
    </main>
  );
}
