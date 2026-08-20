import { Alert, Card, Empty, List, Space, Tag, Typography } from 'antd';

const { Text } = Typography;

export interface LatestNewsItem {
  title: string;
  source?: string | null;
  published_at?: string | null;
  url?: string | null;
  snippet?: string | null;
  provider?: string | null;
}

export interface LatestNewsResponse {
  queried_at: string;
  as_of: string;
  providers_attempted: string[];
  providers_used: string[];
  errors: Record<string, string>;
  data_status: 'OK' | 'PARTIAL' | 'UPSTREAM_ERROR' | 'UNKNOWN';
  news: LatestNewsItem[];
}

function safeUrl(value?: string | null): value is string {
  return Boolean(value && /^https?:\/\//i.test(value));
}

export default function LatestNews({ data, loading = false, error = '' }: { data: LatestNewsResponse | null; loading?: boolean; error?: string }) {
  return (
    <Card className="latest-news" title={<span id="latest-news-title">最新财经消息</span>} loading={loading}>
      {error ? <Alert type="warning" showIcon message="最新消息暂时不可用" description={error} /> : null}
      {data ? (
        <>
          <div className="latest-news__meta">
            <Space wrap size={8}><Tag color={data.data_status === 'OK' ? 'green' : data.data_status === 'PARTIAL' ? 'orange' : 'default'}>{data.data_status}</Tag><Text type="secondary">as_of <span data-testid="latest-news-as-of">{data.as_of || data.queried_at || 'UNKNOWN'}</span></Text><Text type="secondary">来源：{data.providers_used.length ? data.providers_used.map((provider) => <Tag key={provider}>{provider}</Tag>) : 'UNKNOWN'}</Text></Space>
          </div>
          {data.news.length ? <List size="small" dataSource={data.news.slice(0, 6)} renderItem={(item) => <List.Item><div className="latest-news__item">{safeUrl(item.url) ? <a href={item.url} target="_blank" rel="noreferrer noopener">{item.title}</a> : <Text strong>{item.title}</Text>}<Text type="secondary">{[item.source, item.published_at, item.provider].filter(Boolean).join(' · ')}</Text>{item.snippet ? <Text type="secondary" ellipsis={{ tooltip: item.snippet }}>{item.snippet}</Text> : null}</div></List.Item>} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有可展示的最新消息" />}
          {Object.keys(data.errors).length ? <Text type="secondary" className="latest-news__errors">部分来源未返回：{Object.keys(data.errors).join('、')}</Text> : null}
        </>
      ) : <Text type="secondary">暂无可审计的最新消息</Text>}
    </Card>
  );
}
