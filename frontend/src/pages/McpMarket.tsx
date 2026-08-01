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

const { Paragraph, Text, Title } = Typography;

function parameterNames(parameters: Record<string, unknown>): string[] {
  const properties = parameters.properties;
  return properties && typeof properties === 'object' && !Array.isArray(properties)
    ? Object.keys(properties)
    : [];
}

export default function McpMarket() {
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
      setError(cause instanceof Error ? cause.message : 'MCP 工具目录加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

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
      setError(cause instanceof Error ? cause.message : 'MCP 工具状态更新失败');
    } finally {
      setToggling((current) => {
        const next = { ...current };
        delete next[tool.local_name];
        return next;
      });
    }
  }, []);

  const tools = servers.flatMap((server) => server.tools);
  const enabledTools = tools.filter((tool) => tool.enabled).length;

  return (
    <main className="product-page" data-testid="mcp-market-page">
      <Space align="start" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <Text className="eyebrow">RUNTIME CAPABILITIES</Text>
          <Title level={2} style={{ margin: '4px 0 6px' }}><ApiOutlined /> MCP 工具市场</Title>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            查看当前进程已发现的外部 MCP 能力，并控制哪些工具可以被研究 Agent 调用。
          </Paragraph>
        </div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadMarket()}>刷新发现结果</Button>
      </Space>

      {error ? <Alert type="error" showIcon message={error} closable onClose={() => setError('')} style={{ marginBottom: 16 }} /> : null}

      <Row gutter={[12, 12]} style={{ marginBottom: 18 }}>
        <Col xs={12} md={8}><Card size="small"><Statistic title="外部服务器" value={servers.length} /></Card></Col>
        <Col xs={12} md={8}><Card size="small"><Statistic title="已发现工具" value={tools.length} /></Card></Col>
        <Col xs={24} md={8}><Card size="small"><Statistic title="Agent 可用" value={enabledTools} suffix={`/ ${tools.length}`} /></Card></Col>
      </Row>

      {loading ? <Card><Skeleton active paragraph={{ rows: 6 }} /></Card> : servers.length === 0 ? (
        <Card>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="尚未发现外部 MCP 服务器；服务器配置管理将在后续 Settings 阶段提供。"
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
                extra={<Text type="secondary">{active}/{server.tools.length} 已启用</Text>}
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
                            checkedChildren="启用"
                            unCheckedChildren="禁用"
                            aria-label={`${tool.name} 工具启用状态`}
                            onChange={(checked) => void toggleTool(tool, checked)}
                          />,
                        ]}
                      >
                        <List.Item.Meta
                          title={<Space wrap><Text strong>{tool.name}</Text><Tag color="blue">{tool.local_name}</Tag></Space>}
                          description={(
                            <Space direction="vertical" size={8} style={{ width: '100%' }}>
                              <Text type="secondary">{tool.description || '未提供工具描述'}</Text>
                              <Collapse
                                ghost
                                size="small"
                                items={[{
                                  key: 'parameters',
                                  label: names.length > 0 ? `参数：${names.join('、')}` : '参数：无',
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
