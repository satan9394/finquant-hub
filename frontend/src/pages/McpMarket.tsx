import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Button, Card, Col, Collapse, Empty, List, Row, Skeleton, Space, Statistic, Switch, Tag, Typography,
} from 'antd';
import { ApiOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  listMCPServers,
  setMCPToolEnabled,
  type MCPServerItem,
  type MCPToolItem,
} from '../services/mcpApi';
import { useLanguage } from '../i18n/LanguageContext';

const { Paragraph, Text, Title } = Typography;

function parameterNames(parameters: Record<string, unknown>): string[] {
  const properties = parameters.properties;
  return properties && typeof properties === 'object' && !Array.isArray(properties)
    ? Object.keys(properties)
    : [];
}

export default function McpMarket() {
  const { t } = useLanguage();
  const [servers, setServers] = useState<MCPServerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toggling, setToggling] = useState<Record<string, boolean>>({});

  const loadMarket = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await listMCPServers();
      setServers(result.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('mcp.error.load'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadMarket();
  }, [loadMarket]);

  const toggleTool = useCallback(async (tool: MCPToolItem, enabled: boolean) => {
    setToggling((current) => ({ ...current, [tool.local_name]: true }));
    try {
      const updated = await setMCPToolEnabled(tool.local_name, enabled);
      setServers((current) => current.map((server) => ({
        ...server,
        tools: server.tools.map((item) => item.local_name === updated.local_name ? updated : item),
      })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('mcp.error.update'));
    } finally {
      setToggling((current) => {
        const next = { ...current };
        delete next[tool.local_name];
        return next;
      });
    }
  }, [t]);

  const tools = servers.flatMap((server) => server.tools);
  const enabledTools = tools.filter((tool) => tool.enabled).length;

  return (
    <main className="product-page" data-testid="mcp-market-page">
      <Space align="start" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <Text className="eyebrow">{t('mcp.eyebrow')}</Text>
          <Title level={2} style={{ margin: '4px 0 6px' }}><ApiOutlined /> {t('mcp.title')}</Title>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {t('mcp.subtitle')}
          </Paragraph>
        </div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadMarket()}>{t('mcp.refresh')}</Button>
      </Space>

      {error ? <Alert type="error" showIcon message={error} closable onClose={() => setError('')} style={{ marginBottom: 16 }} /> : null}

      <Row gutter={[12, 12]} style={{ marginBottom: 18 }}>
        <Col xs={12} md={8}><Card size="small"><Statistic title={t('mcp.metric.servers')} value={servers.length} /></Card></Col>
        <Col xs={12} md={8}><Card size="small"><Statistic title={t('mcp.metric.tools')} value={tools.length} /></Card></Col>
        <Col xs={24} md={8}><Card size="small"><Statistic title={t('mcp.metric.enabled')} value={enabledTools} suffix={`/ ${tools.length}`} /></Card></Col>
      </Row>

      {loading ? <Card><Skeleton active paragraph={{ rows: 6 }} /></Card> : servers.length === 0 ? (
        <Card>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('mcp.empty')}
          />
        </Card>
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {servers.map((server) => {
            const active = server.tools.filter((tool) => tool.enabled).length;
            return (
              <Card
                key={server.name}
                title={<Space><ApiOutlined /><span>{server.name}</span><Tag>{server.transport.toUpperCase()}</Tag></Space>}
                extra={<Text type="secondary">{t('mcp.enabledCount', { active, total: server.tools.length })}</Text>}
              >
                <List
                  dataSource={server.tools}
                  renderItem={(tool) => {
                    const names = parameterNames(tool.parameters);
                    return (
                      <List.Item
                        key={tool.local_name}
                        actions={[
                          <Switch
                            key="enabled"
                            checked={tool.enabled}
                            loading={Boolean(toggling[tool.local_name])}
                            checkedChildren={t('mcp.enabled')}
                            unCheckedChildren={t('mcp.disabled')}
                            aria-label={t('mcp.toolToggleAria', { name: tool.name })}
                            onChange={(checked) => void toggleTool(tool, checked)}
                          />,
                        ]}
                      >
                        <List.Item.Meta
                          title={<Space wrap><Text strong>{tool.name}</Text><Tag color="blue">{tool.local_name}</Tag></Space>}
                          description={(
                            <Space direction="vertical" size={8} style={{ width: '100%' }}>
                              <Text type="secondary">{tool.description || t('mcp.noDescription')}</Text>
                              <Collapse
                                ghost
                                size="small"
                                items={[{
                                  key: 'parameters',
                                  label: names.length > 0
                                    ? t('mcp.parameters', { names: names.join(t('mcp.parameterSeparator')) })
                                    : t('mcp.noParameters'),
                                  children: <pre style={{ margin: 0, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{JSON.stringify(tool.parameters, null, 2)}</pre>,
                                }]}
                              />
                            </Space>
                          )}
                        />
                      </List.Item>
                    );
                  }}
                />
              </Card>
            );
          })}
        </Space>
      )}
    </main>
  );
}
