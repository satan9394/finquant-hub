/* ============================================================
 * AlphaResearch — WorldQuant 字段与经典 Alpha 的本地检索
 * ============================================================ */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Card, Input, List, Tag, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import apiClient from '../services/api';

const { Title, Text, Paragraph } = Typography;

type AlphaResult = {
  name: string; field?: string; formula?: string; desc: string;
  type: 'wq_field' | 'custom_field' | 'alpha'; dataset?: string; category?: string; region?: string;
};

export default function AlphaResearch() {
  const [searchParams] = useSearchParams();
  const preset = searchParams.get('query')?.trim() || '';
  const [query, setQuery] = useState(preset);
  const [items, setItems] = useState<AlphaResult[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (keyword: string) => {
    setLoading(true);
    try {
      const response = await apiClient.get('/wq/search', { params: { q: keyword } });
      setItems(response.data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (preset) void search(preset);
  }, [preset, search]);

  return (
    <div style={{ padding: 24, maxWidth: 1040, margin: '0 auto' }}>
      <Title level={4}>Alpha 因子研究</Title>
      <Text type="secondary">检索项目内置的 4,367 个 WorldQuant 数据字段与经典 Alpha 模板；结果仅供研究设计，不执行模拟或提交。</Text>
      <Card size="small" style={{ marginTop: 16 }}>
        <Input.Search
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onSearch={(value) => void search(value.trim())}
          enterButton={<><SearchOutlined /> 检索</>}
          placeholder="例如 operating_income、momentum、Alpha001"
          allowClear
        />
      </Card>
      <Alert
        type="info"
        showIcon
        style={{ marginTop: 16 }}
        message="启动测试建议：先检索 operating_income，确认字段目录、数据集与描述均能返回。"
      />
      <List
        loading={loading}
        dataSource={items}
        locale={{ emptyText: preset ? '未找到匹配字段，请换用英文 ID、指标名称或 Alpha 编号。' : '输入关键词开始检索。' }}
        renderItem={(item) => (
          <List.Item>
            <List.Item.Meta
              title={<span><Text strong>{item.name}</Text> <Tag>{item.type === 'wq_field' ? '数据字段' : item.type === 'alpha' ? '经典 Alpha' : '自定义字段'}</Tag></span>}
              description={
                <div>
                  <Paragraph style={{ marginBottom: 4 }}>{item.desc || '暂无描述'}</Paragraph>
                  {item.field && <Text type="secondary">字段 ID：{item.field}</Text>}
                  {item.formula && <pre style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0', fontSize: 12 }}>{item.formula}</pre>}
                  {(item.dataset || item.category || item.region) && <div style={{ marginTop: 6 }}>
                    {item.dataset && <Tag>{item.dataset}</Tag>}
                    {item.category && <Tag>{item.category}</Tag>}
                    {item.region && <Tag>{item.region}</Tag>}
                  </div>}
                </div>
              }
            />
          </List.Item>
        )}
      />
    </div>
  );
}
