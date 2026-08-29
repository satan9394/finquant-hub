import { useCallback, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Descriptions, Menu, Typography } from 'antd';
import { BookOutlined, ExperimentOutlined } from '@ant-design/icons';
import { INDICATOR_KEYS, INDICATOR_KNOWLEDGE, isIndicatorKey } from '../features/indicatorKnowledge';
import MemoryManager from '../components/MemoryManager';
import { useLanguage } from '../i18n/LanguageContext';

const { Title, Text } = Typography;

type StrategyGroup = 'experiment' | 'teaching' | 'advanced';

const strategies: Array<{ key: string; file: string; group: StrategyGroup }> = [
  { key: 'm1', file: 'm1-移动平均策略.html', group: 'experiment' },
  { key: 'm2', file: 'm2-均值回归策略.html', group: 'teaching' },
  { key: 'm3', file: 'm3-动量策略.html', group: 'teaching' },
  { key: 'm4', file: 'm4-市场中性策略.html', group: 'teaching' },
  { key: 'm5', file: 'm5-统计套利策略.html', group: 'teaching' },
  { key: 'm6', file: 'm6-事件驱动策略.html', group: 'advanced' },
  { key: 'm7', file: 'm7-机器学习策略.html', group: 'advanced' },
  { key: 'm8', file: 'm8-高频交易策略.html', group: 'advanced' },
];

export default function Knowledge() {
  const { lang, t } = useLanguage();
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
          <div style={{ padding: '16px', borderBottom: '1px solid var(--fq-border)' }}>
            <Title level={5} style={{ margin: 0 }}><BookOutlined /> {t('library.title')}</Title>
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
                key: 'my-research',
                label: t('library.myResearch'),
                children: [{ key: 'memory', icon: <BookOutlined />, label: t('library.memory') }],
              },
              {
                type: 'group',
                key: 'indicator-reference',
                label: t('library.indicators'),
                children: INDICATOR_KEYS.map((key) => ({
                  key: `indicator:${key}`,
                  icon: <BookOutlined />,
                  label: INDICATOR_KNOWLEDGE[key].shortName,
                })),
              },
              ...(['experiment', 'teaching', 'advanced'] as StrategyGroup[]).map((group) => ({
                type: 'group' as const,
                key: group,
                label: t(`library.group.${group}`),
                children: strategies.filter((strategy) => strategy.group === group).map((strategy) => ({
                  key: strategy.key,
                  icon: <BookOutlined />,
                  label: t(`library.strategy.${strategy.key}`),
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
                  <Text className="eyebrow">{t('library.indicatorEyebrow')}</Text>
                  <Title level={4} style={{ margin: '4px 0' }}>{t(`library.indicator.${indicator.key}.title`)}</Title>
                  <Text type="secondary">{t('library.indicatorNotice')}</Text>
                </div>
                {indicator.key === 'ma' && (
                  <Button icon={<BookOutlined />} onClick={() => { setSearchParams({}); setSelectedKey('m1'); }}>
                    {t('library.readMa')}
                  </Button>
                )}
              </div>
              <Card className="indicator-knowledge-card">
                <Descriptions column={1} bordered size="small">
                  <Descriptions.Item label={t('library.purpose')}>{t(`library.indicator.${indicator.key}.purpose`)}</Descriptions.Item>
                  <Descriptions.Item label={t('library.reading')}>{t(`library.indicator.${indicator.key}.reading`)}</Descriptions.Item>
                  <Descriptions.Item label={t('library.method')}>{t(`library.indicator.${indicator.key}.method`)}</Descriptions.Item>
                  <Descriptions.Item label={t('library.pitfall')}>{t(`library.indicator.${indicator.key}.pitfall`)}</Descriptions.Item>
                </Descriptions>
              </Card>
            </>
          ) : (
            <>
              <div className="knowledge-toolbar">
                <div>
                  <Text className="eyebrow">{t('library.teachingEyebrow')}</Text>
                  <Title level={4} style={{ margin: '4px 0' }}>{t(`library.strategy.${current.key}`)}</Title>
                  <Text type="secondary">
                    {current.group === 'experiment'
                      ? t('library.experimentNotice')
                      : t('library.teachingNotice')}
                  </Text>
                </div>
                {selectedKey === 'm1' && (
                  <Button type="primary" icon={<ExperimentOutlined />} onClick={() => navigate('/strategy-lab/ma-crossover')}>
                    {t('library.openStrategy')}
                  </Button>
                )}
              </div>
              {lang === 'zh' ? (
                <iframe
                  ref={iframeRef}
                  src={`/knowledge/${current.file}`}
                  style={{ width: '100%', height: frameHeight, border: 0, display: 'block' }}
                  title={t(`library.strategy.${current.key}`)}
                  scrolling="no"
                  onLoad={resizeFrame}
                />
              ) : (
                <Card title={t('library.original.title')}>
                  <Typography.Paragraph type="secondary">{t('library.original.description')}</Typography.Paragraph>
                  <Button href={`/knowledge/${current.file}`} target="_blank" rel="noreferrer">{t('library.original.open')}</Button>
                </Card>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
