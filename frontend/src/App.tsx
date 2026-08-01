/* ============================================================
 * App — 主应用（AntD ProLayout + 路由）
 * ============================================================ */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Button, ConfigProvider, Space, theme as antTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import ProLayout from '@ant-design/pro-layout';
import {
  DashboardOutlined,
  MessageOutlined,
  TeamOutlined,
  BookOutlined,
  RobotOutlined,
  SettingOutlined,
  FundOutlined,
  BarChartOutlined,
  WalletOutlined,
  ExperimentOutlined,
  SunOutlined,
  MoonOutlined,
  ApiOutlined,
  AlertOutlined,
} from '@ant-design/icons';
import apiClient from './services/api';
import { useModelStore } from './store/modelStore';
import ModelSelector from './components/ModelSelector';
import NotificationCenter from './components/NotificationCenter';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Chat = lazy(() => import('./pages/Chat'));
const Discussion = lazy(() => import('./pages/Discussion'));
const Knowledge = lazy(() => import('./pages/Knowledge'));
const Models = lazy(() => import('./pages/Models'));
const Settings = lazy(() => import('./pages/Settings'));
const StockAnalysis = lazy(() => import('./pages/StockAnalysis'));
const Research = lazy(() => import('./pages/Research'));
const ResearchWorkspace = lazy(() => import('./pages/ResearchWorkspace'));
const StrategyLab = lazy(() => import('./pages/StrategyLab'));
const Portfolio = lazy(() => import('./pages/Portfolio'));
const Screening = lazy(() => import('./pages/Screening'));
const AlphaResearch = lazy(() => import('./pages/AlphaResearch'));
const McpMarket = lazy(() => import('./pages/McpMarket'));
const Alerts = lazy(() => import('./pages/Alerts'));

const menuItems = [
  { path: '/', name: '仪表盘', icon: <DashboardOutlined /> },
  { path: '/chat', name: '对话', icon: <MessageOutlined /> },
  { path: '/discussion', name: '讨论', icon: <TeamOutlined /> },
  { path: '/research', name: '深度研究', icon: <FundOutlined /> },
  { path: '/strategy-lab/ma-crossover', name: '策略实验室', icon: <ExperimentOutlined /> },
  { path: '/portfolio', name: '投资组合', icon: <WalletOutlined /> },
  { path: '/screening', name: '选股器', icon: <BarChartOutlined /> },
  { path: '/alpha', name: 'Alpha 因子', icon: <ExperimentOutlined /> },
  { path: '/knowledge', name: '知识库', icon: <BookOutlined /> },
  { path: '/models', name: '模型', icon: <RobotOutlined /> },
  { path: '/mcp-market', name: 'MCP 工具', icon: <ApiOutlined /> },
  { path: '/alerts', name: '预警中心', icon: <AlertOutlined /> },
  { path: '/settings', name: '设置', icon: <SettingOutlined /> },
];

interface AppLayoutProps {
  isDark: boolean;
  onToggleTheme: () => void;
}

function AppLayout({ isDark, onToggleTheme }: AppLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const setModels = useModelStore((s) => s.setModels);
  const [collapsed, setCollapsed] = useState(false);

  // 加载模型列表
  useEffect(() => {
    apiClient.get('/models')
      .then((res) => setModels(res.data.items))
      .catch(() => {});
  }, [setModels]);


  const menuData = useMemo(
    () => menuItems.map((item) => ({ ...item, key: item.path })),
    []
  );

  const menuKey = location.pathname.startsWith('/research')
    ? '/research'
    : location.pathname.startsWith('/strategy-lab')
      ? '/strategy-lab/ma-crossover'
      : location.pathname === '/' ? '/' : location.pathname;

  return (
    <ProLayout
      title="FinQuant Hub"
      logo="/favicon.svg"
      layout="side"
      navTheme={isDark ? 'realDark' : 'light'}
      contentStyle={{ background: isDark ? '#141414' : '#f3f6fa', minHeight: 'calc(100vh - 48px)' }}
      actionsRender={() => [
        <NotificationCenter key="notification-center" />,
        <Space.Compact key="model-selector">
          <span style={{ fontSize: 12, color: '#888', alignSelf: 'center', marginRight: 8 }}>当前模型:</span>
          <ModelSelector />
        </Space.Compact>,
        <Button
          key="theme-toggle"
          type="default"
          style={{ borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          aria-label={isDark ? '切换到浅色主题' : '切换到深色主题'}
          title={isDark ? '切换到浅色主题' : '切换到深色主题'}
          icon={isDark ? <SunOutlined /> : <MoonOutlined />}
          onClick={onToggleTheme}
        />,
      ]}
      menuDataRender={() => menuData}
      menuItemRender={(item: any, dom: any) => (
        <a onClick={() => navigate(item.path || '/')}>{dom}</a>
      )}
      location={{ pathname: menuKey }}
      siderWidth={196}
      breakpoint="lg"
      collapsed={collapsed}
      onCollapse={setCollapsed}
    >
      <Suspense fallback={<div style={{ padding: 48, textAlign: 'center' }}>页面加载中…</div>}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/discussion" element={<Discussion />} />
        <Route path="/knowledge" element={<Knowledge />} />
        <Route path="/models" element={<Models />} />
        <Route path="/mcp-market" element={<McpMarket />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/analysis/:ticker" element={<StockAnalysis />} />
        <Route path="/research" element={<ResearchWorkspace />} />
        <Route path="/research/reports" element={<Research />} />
        <Route path="/research/:symbol" element={<ResearchWorkspace />} />
        <Route path="/strategy-lab/ma-crossover" element={<StrategyLab />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/screening" element={<Screening />} />
        <Route path="/alpha" element={<AlphaResearch />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </ProLayout>
  );
}

export default function App() {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('finquant_theme') === 'dark');

  const toggleTheme = () => {
    setIsDark((current) => {
      const next = !current;
      localStorage.setItem('finquant_theme', next ? 'dark' : 'light');
      return next;
    });
  };

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
      }}
    >
      <BrowserRouter>
        <AppLayout isDark={isDark} onToggleTheme={toggleTheme} />
      </BrowserRouter>
    </ConfigProvider>
  );
}
