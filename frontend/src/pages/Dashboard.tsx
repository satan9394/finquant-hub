/* ============================================================
 * Dashboard — 系统总览页
 * ============================================================ */
import { useEffect, useState, useCallback } from 'react';
import { Card, Row, Col, Statistic, List, Typography, Input, Button, message, Tag } from 'antd';
import {
  RobotOutlined, MessageOutlined, TeamOutlined, CommentOutlined,
  PlusOutlined, ReloadOutlined, RiseOutlined, FallOutlined, SearchOutlined, FundOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import apiClient from '../services/api';
import { fetchQuote, searchStocks } from '../services/stockApi';
import { useModelStore } from '../store/modelStore';
import StockChart from '../components/StockChart';
import { fetchPortfolioSummary, fetchSignalSummary } from '../services/analysisApi';
import type { DashboardStats, RealTimeQuote, SearchResult, PortfolioSummary, SignalSummary } from '../types';

const { Text, Title } = Typography;

// ---------- 自选股本地存储 ----------
const WATCHLIST_KEY = 'finquant_watchlist';

interface WatchItem {
  code: string;
  name: string;
}

function loadWatchlist(): WatchItem[] {
  try {
    return JSON.parse(localStorage.getItem(WATCHLIST_KEY) || '[]');
  } catch { return []; }
}

function saveWatchlist(items: WatchItem[]) {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(items));
}

export default function Dashboard() {
  const navigate = useNavigate();
  const theme = 'light'; // 由 Settings 页控制，简化
  const currentModel = useModelStore((s) => s.currentModel);
  const currentModelId = useModelStore((s) => s.currentModelId);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  // 自选股行情
  const [watchlist, setWatchlist] = useState<WatchItem[]>(loadWatchlist);
  const [quotes, setQuotes] = useState<Record<string, RealTimeQuote>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  // 投资组合摘要（仪表盘概览）
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioSummary | null>(null);
  const [signalSummary, setSignalSummary] = useState<SignalSummary | null>(null);

  // 快速分析入口
  const [analysisQuery, setAnalysisQuery] = useState('');
  const [analysisResults, setAnalysisResults] = useState<SearchResult[]>([]);

  // 加载统计
  const loadStats = useCallback(async () => {
    try {
      const res = await apiClient.get('/dashboard/stats');
      setStats(res.data);
    } catch { /* stats not critical */ }
    finally { setLoading(false); }
  }, []);

  // 加载投资组合摘要
  const loadPortfolioSummary = useCallback(async () => {
    try {
      const s = await fetchPortfolioSummary();
      setPortfolioSummary(s);
    } catch { /* 后端尚未实现时为静默失败 */ }
  }, []);

  // 加载信号摘要
  const loadSignalSummary = useCallback(async () => {
    try {
      const s = await fetchSignalSummary();
      setSignalSummary(s);
    } catch { /* 后端尚未实现时为静默失败 */ }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadPortfolioSummary(); }, [loadPortfolioSummary]);
  useEffect(() => { loadSignalSummary(); }, [loadSignalSummary]);

  // 加载自选股行情
  const refreshQuotes = useCallback(async () => {
    if (watchlist.length === 0) return;
    const newQuotes: Record<string, RealTimeQuote> = {};
    await Promise.all(
      watchlist.map(async (item) => {
        try {
          const q = await fetchQuote(item.code);
          newQuotes[item.code] = q;
        } catch { /* ignore */ }
      })
    );
    setQuotes((prev) => ({ ...prev, ...newQuotes }));
  }, [watchlist]);

  useEffect(() => {
    refreshQuotes();
    const timer = setInterval(refreshQuotes, 10000);
    return () => clearInterval(timer);
  }, [refreshQuotes]);

  // 搜索股票（自选股添加用）
  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); return; }
    try {
      const res = await searchStocks(q);
      setSearchResults(res);
    } catch { setSearchResults([]); }
  }, []);

  // 搜索股票（快速分析用）
  const handleAnalysisSearch = useCallback(async (q: string) => {
    setAnalysisQuery(q);
    if (!q.trim()) { setAnalysisResults([]); return; }
    try {
      const res = await searchStocks(q);
      setAnalysisResults(res);
    } catch { setAnalysisResults([]); }
  }, []);

  // 跳转到分析页
  const goToAnalysis = (code: string) => {
    setAnalysisQuery('');
    setAnalysisResults([]);
    navigate(`/analysis/${code}`);
  };

  // 添加到自选股
  const addToWatchlist = (code: string, name: string) => {
    if (watchlist.find((w) => w.code === code)) {
      message.info('已在自选股中');
      return;
    }
    const newList = [...watchlist, { code, name }];
    setWatchlist(newList);
    saveWatchlist(newList);
    setSearchResults([]);
    setSearchQuery('');
    message.success(`已添加 ${name}`);
  };

  // 从自选股移除
  const removeFromWatchlist = (code: string) => {
    const newList = watchlist.filter((w) => w.code !== code);
    setWatchlist(newList);
    saveWatchlist(newList);
  };

  const statsCards = [
    { icon: <RobotOutlined />, title: '模型总数', value: stats?.model_count ?? 0, color: '#722ed1' },
    { icon: <MessageOutlined />, title: '会话数', value: stats?.conversation_count ?? 0, color: '#1890ff' },
    { icon: <TeamOutlined />, title: '讨论数', value: stats?.discussion_count ?? 0, color: '#13c2c2' },
    { icon: <CommentOutlined />, title: '消息数', value: stats?.message_count ?? 0, color: '#52c41a' },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Title level={4} style={{ marginBottom: 16 }}>系统总览</Title>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]}>
        {statsCards.map((card) => (
          <Col xs={12} sm={6} key={card.title}>
            <Card hoverable>
              <Statistic
                title={card.title}
                value={card.value}
                prefix={<span style={{ color: card.color }}>{card.icon}</span>}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* 投资组合与信号概览 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {/* 投资组合盈亏 */}
        <Col xs={24} md={12}>
          <Card title="投资组合概览" size="small" hoverable
            extra={<Button type="link" size="small" onClick={() => navigate('/portfolio')}>查看详情</Button>}
          >
            {portfolioSummary ? (
              <div>
                <Statistic
                  title="总盈亏"
                  value={portfolioSummary.total_profit}
                  precision={2}
                  prefix={portfolioSummary.total_profit >= 0 ? <RiseOutlined /> : <FallOutlined />}
                  valueStyle={{ color: portfolioSummary.total_profit >= 0 ? '#f23645' : '#089981', fontFamily: 'monospace' }}
                  suffix={<span style={{ fontSize: 14, fontWeight: 400 }}>({portfolioSummary.total_profit_percent.toFixed(2)}%)</span>}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>投入: ¥{portfolioSummary.total_invested.toFixed(2)}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>市值: ¥{portfolioSummary.total_current.toFixed(2)}</Text>
                </div>
                {portfolioSummary.group_summaries?.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {portfolioSummary.group_summaries.map((g) => (
                      <div key={g.group_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
                        <span>{g.group_name}</span>
                        <span style={{ color: g.profit >= 0 ? '#f23645' : '#089981', fontFamily: 'monospace' }}>
                          {g.profit >= 0 ? '+' : ''}{g.profit.toFixed(2)} ({g.profit_percent.toFixed(2)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>暂无投资组合数据</Text>
            )}
          </Card>
        </Col>

        {/* 信号概览 */}
        <Col xs={24} md={12}>
          <Card title="信号概览" size="small">
            {signalSummary ? (
              <div>
                <Row gutter={16}>
                  <Col span={8}>
                    <Statistic title="看多" value={signalSummary.bullish} valueStyle={{ color: '#f23645' }} />
                  </Col>
                  <Col span={8}>
                    <Statistic title="看空" value={signalSummary.bearish} valueStyle={{ color: '#089981' }} />
                  </Col>
                  <Col span={8}>
                    <Statistic title="中性" value={signalSummary.neutral} valueStyle={{ color: '#faad14' }} />
                  </Col>
                </Row>
                {signalSummary.signals?.slice(0, 5).map((s, i) => (
                  <Tag key={i} color={s.type === 'bullish' ? 'red' : s.type === 'bearish' ? 'green' : 'default'}
                    style={{ marginTop: 6 }}>
                    {s.label}
                  </Tag>
                ))}
              </div>
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>暂无信号数据</Text>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {/* 近期会话 */}
        <Col xs={24} md={12}>
          <Card title="近期会话" size="small" extra={
            <Button type="link" onClick={() => navigate('/chat')}>查看全部</Button>
          }>
            <List
              size="small"
              dataSource={stats?.recent_conversations?.slice(0, 5) || []}
              renderItem={(item) => (
                <List.Item
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate('/chat')}
                >
                  <Text ellipsis>{item.title || `会话 #${item.id}`}</Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>{item.last_message?.slice(0, 30)}</Text>
                </List.Item>
              )}
              locale={{ emptyText: '暂无会话' }}
            />
          </Card>
        </Col>

        {/* 近期讨论 */}
        <Col xs={24} md={12}>
          <Card title="近期讨论" size="small" extra={
            <Button type="link" onClick={() => navigate('/discussion')}>查看全部</Button>
          }>
            <List
              size="small"
              dataSource={stats?.recent_rooms?.slice(0, 5) || []}
              renderItem={(item) => (
                <List.Item
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate('/discussion')}
                >
                  <Text ellipsis>{item.topic}</Text>
                  <Tag color={item.current_phase === 'done' ? 'green' : 'blue'}>
                    {item.current_phase === 'done' ? '已完成' : '进行中'}
                  </Tag>
                </List.Item>
              )}
              locale={{ emptyText: '暂无讨论' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 快速入口 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card title="快速入口" size="small">
            <Row gutter={[12, 12]}>
              <Col><Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/chat')}>发起对话</Button></Col>
              <Col><Button icon={<TeamOutlined />} onClick={() => navigate('/discussion')}>创建讨论</Button></Col>
              <Col><Button icon={<RobotOutlined />} onClick={() => navigate('/models')}>管理模型</Button></Col>
              <Col><Button icon={<FundOutlined />} onClick={() => navigate('/research')}>深度研究</Button></Col>
              <Col><Button icon={<ReloadOutlined />} onClick={loadStats}>刷新</Button></Col>
            </Row>
          </Card>
        </Col>
      </Row>

      {/* 快速分析入口 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card title="快速个股分析" size="small" extra={
            <Text type="secondary" style={{ fontSize: 11 }}>输入股票代码或名称，一键进入分析页</Text>
          }>
            <div style={{ position: 'relative' }}>
              <Input.Search
                placeholder="例如 600519 或 贵州茅台"
                value={analysisQuery}
                onChange={(e) => handleAnalysisSearch(e.target.value)}
                onSearch={(val) => val && goToAnalysis(val)}
                enterButton={<><SearchOutlined /> 分析</>}
                style={{ maxWidth: 400 }}
              />
              {analysisResults.length > 0 && (
                <div style={{
                  position: 'absolute', top: 40, left: 0, width: 400, zIndex: 100,
                  background: '#fff', border: '1px solid #f0f0f0', borderRadius: 4,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                }}>
                  {analysisResults.slice(0, 6).map((item) => (
                    <div
                      key={item.code}
                      onClick={() => goToAnalysis(item.code)}
                      style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#fafafa')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <Text strong>{item.name}</Text>
                      <Text style={{ marginLeft: 8, color: '#888', fontSize: 12 }}>{item.code}</Text>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </Col>
      </Row>

      {/* 自选股行情面板 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card
            title="自选股行情"
            size="small"
            extra={
              <Button size="small" icon={<ReloadOutlined />} onClick={refreshQuotes}>
                刷新
              </Button>
            }
          >
            {/* 搜索添加 */}
            <Input.Search
              placeholder="输入股票代码/名称搜索"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              style={{ marginBottom: 12, width: 300 }}
            />
            {searchResults.length > 0 && (
              <List
                size="small"
                dataSource={searchResults.slice(0, 5)}
                renderItem={(item) => (
                  <List.Item
                    actions={[
                      <Button size="small" type="link" onClick={() => addToWatchlist(item.code, item.name)}>添加</Button>
                    ]}
                  >
                    <Text>{item.name} ({item.code})</Text>
                  </List.Item>
                )}
                style={{ marginBottom: 12, border: '1px solid #f0f0f0', borderRadius: 4, maxWidth: 400 }}
              />
            )}

            {/* 自选股列表 */}
            <Row gutter={[12, 12]}>
              {watchlist.map((item) => {
                const q = quotes[item.code];
                const isUp = (q?.change_percent ?? 0) >= 0;
                return (
                  <Col xs={12} sm={8} md={6} key={item.code}>
                    <Card
                      size="small"
                      hoverable
                      actions={[
                        <Button type="link" size="small" danger onClick={() => removeFromWatchlist(item.code)}>删除</Button>
                      ]}
                    >
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: '#888' }}>{item.code}</div>
                        {q ? (
                          <>
                            <div style={{ fontSize: 18, fontWeight: 700, color: isUp ? '#f23645' : '#089981', fontFamily: 'monospace' }}>
                              {q.price.toFixed(2)}
                            </div>
                            <div style={{ fontSize: 12, color: isUp ? '#f23645' : '#089981' }}>
                              {q.change >= 0 ? '+' : ''}{q.change.toFixed(2)} ({q.change_percent.toFixed(2)}%)
                            </div>
                          </>
                        ) : (
                          <div style={{ color: '#aaa', fontSize: 12 }}>加载中...</div>
                        )}
                      </div>
                    </Card>
                  </Col>
                );
              })}
              {watchlist.length === 0 && (
                <Col span={24}>
                  <div style={{ textAlign: 'center', color: '#aaa', padding: 20 }}>
                    暂无自选股，请搜索添加
                  </div>
                </Col>
              )}
            </Row>

            {/* 显示第一个自选股的K线 */}
            {watchlist.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <StockChart ticker={watchlist[0].code} theme={theme} height={300} />
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* AI 免责声明 */}
      <div style={{ textAlign: 'center', fontSize: 11, color: '#bbb', marginTop: 24 }}>
        此内容由 AI 生成，不构成投资建议
      </div>
    </div>
  );
}
