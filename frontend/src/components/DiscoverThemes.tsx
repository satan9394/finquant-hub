import { useRef, useState } from 'react';
import { Alert, Button, Card, Input, List, Segmented, Space, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { fetchMarketThemes } from '../services/marketDiscoveryApi';
import type { MarketThemesResponse } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

export default function DiscoverThemes() {
  const { t } = useLanguage();
  const [keyword, setKeyword] = useState('');
  const [kind, setKind] = useState('all');
  const [payload, setPayload] = useState<MarketThemesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const requestId = useRef(0);
  const run = async (value: string) => {
    if (!value.trim()) return;
    const id = ++requestId.current;
    setKeyword(value);
    setLoading(true);
    setError(false);
    setPayload(null);
    try {
      const result = await fetchMarketThemes(value.trim());
      if (id === requestId.current) setPayload(result);
    } catch {
      if (id === requestId.current) setError(true);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };
  return <Card className="surface-card" title={t('discover.themes.title')}>
    <Typography.Paragraph type="secondary">{t('discover.themes.help')}</Typography.Paragraph>
    <Input.Search aria-label={t('discover.themes.title')} maxLength={30} value={keyword} onChange={(event) => setKeyword(event.target.value)} onSearch={(value) => void run(value)} loading={loading} enterButton={t('discover.themes.search')} />
    <Space wrap style={{ marginTop: 12 }}>{['半导体', '新能源', '人工智能'].map((value) => <Button key={value} onClick={() => void run(value)}>{value}</Button>)}</Space>
    <Segmented style={{ marginTop: 12, display: 'block' }} value={kind} onChange={setKind} options={['all', 'industry', 'concept'].map((value) => ({ value, label: t(`discover.themes.${value}`) }))} />
    {error && <Alert type="warning" showIcon message={t('discover.themes.failed')} />}
    {payload && <>
      <Typography.Paragraph type="secondary">{payload.source.join(' / ')} · {payload.as_of} · {t(`discover.themes.status.${payload.status}`)}</Typography.Paragraph>
      {payload.status === 'partial' && <Alert type="warning" showIcon message={t('discover.themes.partial')} />}
      <List dataSource={payload.themes.filter((theme) => kind === 'all' || theme.kind === kind)} locale={{ emptyText: t('discover.themes.empty') }} renderItem={(theme) => <List.Item>
        <Space direction="vertical">
          <span><Tag>{t(`discover.themes.${theme.kind}`)}</Tag>{theme.name}</span>
          <Space wrap>{theme.stocks.map((stock) => <Link key={stock.code} to={`/research/${encodeURIComponent(stock.code)}`}>{stock.name} · {stock.code}</Link>)}</Space>
        </Space>
      </List.Item>} />
    </>}
  </Card>;
}
