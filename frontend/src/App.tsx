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
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import apiClient from './services/api';
import { useModelStore } from './store/modelStore';
import ModelSelector from './components/ModelSelector';

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
  { path: '/settings', name: '设置', icon: <SettingOutlined /> },
];

function AppLayout() {
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

  // 检查主题偏好
  const isDark = localStorage.getItem('finquant_theme') === 'dark';

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
      contentStyle={{ background: '#f3f6fa', minHeight: 'calc(100vh - 48px)' }}
      headerRender={(props) => (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          height: 48, padding: '0 24px', gap: 12,
          background: isDark ? '#141414' : '#fff',
          borderBottom: `1px solid ${isDark ? '#303030' : '#f0f0f0'}`,
        }}>
          <Button
            className="mobile-nav-toggle"
            type="text"
            aria-label="切换导航"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed((value) => !value)}
          />
          <Space.Compact>
            <span style={{ fontSize: 12, color: '#888', alignSelf: 'center', marginRight: 8 }}>当前模型:</span>
            <ModelSelector />
          </Space.Compact>
        </div>
      )}
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
  const isDark = localStorage.getItem('finquant_theme') === 'dark';

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
      }}
    >
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </ConfigProvider>
  );
}
