import { useCallback, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Descriptions, Menu, Typography } from 'antd';
import { BookOutlined, ExperimentOutlined } from '@ant-design/icons';
import { INDICATOR_KEYS, INDICATOR_KNOWLEDGE, isIndicatorKey } from '../features/indicatorKnowledge';
import MemoryManager from '../components/MemoryManager';

const { Title, Text } = Typography;

const strategies = [
  { key: 'm1', label: '双均线策略', file: 'm1-移动平均策略.html', group: '可直接实验' },
  { key: 'm2', label: '均值回归策略', file: 'm2-均值回归策略.html', group: '教学参考' },
  { key: 'm3', label: '动量策略', file: 'm3-动量策略.html', group: '教学参考' },
  { key: 'm4', label: '市场中性策略', file: 'm4-市场中性策略.html', group: '教学参考' },
  { key: 'm5', label: '统计套利策略', file: 'm5-统计套利策略.html', group: '教学参考' },
  { key: 'm6', label: '事件驱动策略', file: 'm6-事件驱动策略.html', group: '进阶概念' },
  { key: 'm7', label: '机器学习策略', file: 'm7-机器学习策略.html', group: '进阶概念' },
  { key: 'm8', label: '高频交易策略', file: 'm8-高频交易策略.html', group: '进阶概念' },
];

export default function Knowledge() {
  const [selectedKey, setSelectedKey] = useState(strategies[0].key);
  const [frameHeight, setFrameHeight] = useState(1100);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedIndicator = searchParams.get('indicator');
  const memoryView = searchParams.get('view') === 'memory';
  const indicatorKey = isIndicatorKey(requestedIndicator) ? requestedIndicator : null;
  const indicator = indicatorKey ? INDICATOR_KNOWLEDGE[indicatorKey] : null;
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
            selectedKeys={[memoryView ? 'memory' : indicatorKey ? `indicator:${indicatorKey}` : selectedKey]}
            onClick={({ key }) => {
              if (key === 'memory') {
                setSearchParams({ view: 'memory' });
              } else if (key.startsWith('indicator:')) {
                setSearchParams({ indicator: key.slice('indicator:'.length) });
              } else {
                setSearchParams({});
                setSelectedKey(key);
              }
            }}
            style={{ borderRight: 0, background: 'transparent' }}
            items={[
              {
                type: 'group',
                key: '我的研究',
                label: '我的研究',
                children: [{ key: 'memory', icon: <BookOutlined />, label: '研究记忆' }],
              },
              {
                type: 'group',
                key: '指标速查',
                label: '指标速查',
                children: INDICATOR_KEYS.map((key) => ({
                  key: `indicator:${key}`,
                  icon: <BookOutlined />,
                  label: INDICATOR_KNOWLEDGE[key].shortName,
                })),
              },
              ...['可直接实验', '教学参考', '进阶概念'].map((group) => ({
                type: 'group' as const,
                key: group,
                label: group,
                children: strategies.filter((strategy) => strategy.group === group).map((strategy) => ({
                  key: strategy.key,
                  icon: <BookOutlined />,
                  label: strategy.label,
                })),
              })),
            ]}
          />
        </aside>
        <section className="knowledge-content">
          {memoryView ? (
            <MemoryManager />
          ) : indicator ? (
            <>
              <div className="knowledge-toolbar">
                <div>
                  <Text className="eyebrow">INDICATOR KNOWLEDGE · DAILY</Text>
                  <Title level={4} style={{ margin: '4px 0' }}>{indicator.title}</Title>
                  <Text type="secondary">与个股分析共用同一解释口径；具体数值仍以标的响应和截止日为准。</Text>
                </div>
                {indicator.key === 'ma' && (
                  <Button icon={<BookOutlined />} onClick={() => { setSearchParams({}); setSelectedKey('m1'); }}>
                    阅读双均线策略
                  </Button>
                )}
              </div>
              <Card className="indicator-knowledge-card">
                <Descriptions column={1} bordered size="small">
                  <Descriptions.Item label="用途">{indicator.purpose}</Descriptions.Item>
                  <Descriptions.Item label="怎么读">{indicator.reading}</Descriptions.Item>
                  <Descriptions.Item label="参数与公式">{indicator.method}</Descriptions.Item>
                  <Descriptions.Item label="常见误区">{indicator.pitfall}</Descriptions.Item>
                </Descriptions>
              </Card>
            </>
          ) : (
            <>
              <div className="knowledge-toolbar">
                <div>
                  <Text className="eyebrow">KNOWLEDGE · TEACHING DEMO</Text>
                  <Title level={4} style={{ margin: '4px 0' }}>{current.label}</Title>
                  <Text type="secondary">
                    {current.group === '可直接实验'
                      ? '可带入策略实验室，以真实行情、费用与回撤指标回测。'
                      : '教学内容中的随机曲线仅用于示意，不作为研究或回测数据。'}
                  </Text>
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
            </>
          )}
        </section>
      </div>
    </main>
  );
}
