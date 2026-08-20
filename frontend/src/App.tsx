/* ============================================================
 * App — 主应用（AntD ProLayout + 路由）
 * ============================================================ */
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Button, ConfigProvider, Spin, theme as antTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import ProLayout from '@ant-design/pro-layout';
import {
  DashboardOutlined,
  BookOutlined,
  RobotOutlined,
  FundOutlined,
  WalletOutlined,
  ExperimentOutlined,
  SettingOutlined,
  SunOutlined,
  MoonOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import apiClient from './services/api';
import { useModelStore } from './store/modelStore';
import ModelSelector from './components/ModelSelector';
import NotificationCenter from './components/NotificationCenter';
import CommandBar from './components/CommandBar';
import { useAuthStore } from './store/authStore';
import {
  PROFESSIONAL_PREFERENCES_EVENT,
  PROFESSIONAL_PREFERENCES_KEY,
  readProfessionalPreferences,
} from './features/professionalPreferences';

const Login = lazy(() => import('./pages/Login'));
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
const Thesis = lazy(() => import('./pages/Thesis'));
const ComparisonWorkspace = lazy(() => import('./pages/ComparisonWorkspace'));

export const navigationGroups = [
  {
    key: 'today',
    name: '今日',
    icon: <DashboardOutlined />,
    children: [
      { key: '/', path: '/', name: '工作台' },
    ],
  },
  {
    key: 'research',
    name: '研究',
    icon: <FundOutlined />,
    children: [
      { key: '/research', path: '/research', name: '研究工作区' },
      { key: '/research/reports', path: '/research/reports', name: '深度研究' },
      { key: '/compare', path: '/compare', name: '比较工作区' },
      { key: '/chat', path: '/chat', name: '快速问答' },
      { key: '/discussion', path: '/discussion', name: '多视角审查' },
      { key: '/thesis', path: '/thesis', name: '投资论文' },
    ],
  },
  {
    key: 'strategy',
    name: '策略',
    icon: <ExperimentOutlined />,
    children: [
      { key: '/strategy-lab/ma-crossover', path: '/strategy-lab/ma-crossover', name: '策略实验室' },
      { key: '/screening', path: '/screening', name: '选股器' },
      { key: '/alpha', path: '/alpha', name: 'Alpha 因子' },
    ],
  },
  {
    key: 'portfolio',
    name: '组合',
    icon: <WalletOutlined />,
    children: [
      { key: '/portfolio', path: '/portfolio', name: '持仓与风险' },
      { key: '/alerts', path: '/alerts', name: '预警中心' },
    ],
  },
  {
    key: 'knowledge',
    name: '知识',
    icon: <BookOutlined />,
    children: [
      { key: '/knowledge', path: '/knowledge', name: '知识库' },
    ],
  },
  {
    key: 'system-tools',
    name: '系统工具',
    icon: <SettingOutlined />,
    children: [
      { key: '/models', path: '/models', name: '模型管理' },
      { key: '/mcp-market', path: '/mcp-market', name: 'MCP 工具管理' },
      { key: '/settings', path: '/settings', name: '系统设置' },
    ],
  },
];

export const systemToolPaths = ['/models', '/mcp-market', '/settings'] as const;

export function isSystemToolPath(pathname: string): boolean {
  return systemToolPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function getMenuKey(pathname: string): string {
  if (pathname.startsWith('/research/reports')) return '/research/reports';
  if (pathname.startsWith('/research') || pathname.startsWith('/analysis')) return '/research';
  if (pathname.startsWith('/strategy-lab')) return '/strategy-lab/ma-crossover';
  return pathname === '/' ? '/' : pathname;
}

interface AppLayoutProps {
  isDark: boolean;
  onToggleTheme: () => void;
}

function AppLayout({ isDark, onToggleTheme }: AppLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const setModels = useModelStore((s) => s.setModels);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [collapsed, setCollapsed] = useState(false);

  // 加载模型列表
  useEffect(() => {
    apiClient.get('/models')
      .then((res) => setModels(res.data.items))
      .catch(() => {});
  }, [setModels]);


  const menuKey = getMenuKey(location.pathname);
  const systemTool = isSystemToolPath(location.pathname);
  const commandContext = location.pathname.startsWith('/portfolio') ? '组合' : location.pathname.startsWith('/strategy-lab') ? '策略实验' : location.pathname.startsWith('/analysis') ? '个股研究' : undefined;

  return (
    <ProLayout
      title="FinQuant Hub"
      logo="/favicon.svg"
      layout="side"
      navTheme={isDark ? 'realDark' : 'light'}
      contentStyle={{ background: isDark ? '#141414' : '#f3f6fa', minHeight: 'calc(100vh - 48px)' }}
      headerContentRender={() => <CommandBar onNavigate={navigate} context={commandContext} />}
      actionsRender={() => [
        <div className="sider-actions" key="sider-actions">
          <div className="model-dock">
            <RobotOutlined className="model-dock__icon" />
            <div className="model-dock__content">
              <span className="model-dock__label">当前 AI 模型</span>
              <ModelSelector />
            </div>
          </div>
          <div className="sider-actions__controls">
            <NotificationCenter />
            <Button
              type="default"
              aria-label={isDark ? '切换到浅色主题' : '切换到深色主题'}
              title={isDark ? '切换到浅色主题' : '切换到深色主题'}
              icon={isDark ? <SunOutlined /> : <MoonOutlined />}
              onClick={onToggleTheme}
            />
            {user?.local_mode ? (
              <span className="sider-actions__mode">本地模式</span>
            ) : (
              <Button
                type="text"
                icon={<LogoutOutlined />}
                aria-label={`退出登录${user?.email ? `：${user.email}` : ''}`}
                onClick={() => void logout()
                  .catch(() => undefined)
                  .then(() => navigate('/login', { replace: true }))}
              >
                退出
              </Button>
            )}
          </div>
        </div>,
      ]}
      menuDataRender={() => navigationGroups}
      menuItemRender={(item: any, dom: any) => item.path ? (
        <a
          href={item.path}
          onClick={(event) => {
            event.preventDefault();
            navigate(item.path);
          }}
        >
          {dom}
        </a>
      ) : dom}
      location={{ pathname: menuKey }}
      siderWidth={220}
      breakpoint="lg"
      collapsed={collapsed}
      onCollapse={setCollapsed}
    >
      <header className="global-task-bar">
        <CommandBar onNavigate={navigate} context={commandContext} />
      </header>
      {systemTool && (
        <section className="system-tool-boundary" aria-label="系统工具边界">
          <div>
            <strong>系统工具</strong>
            <span>用于维护模型、MCP 与安全设置；不是开始研究、验证策略或体检组合的前置步骤。</span>
          </div>
          <Button onClick={() => navigate('/research')}>返回研究工作区</Button>
        </section>
      )}
      <Suspense fallback={<div style={{ padding: 48, textAlign: 'center' }}>页面加载中…</div>}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/discussion" element={<Discussion />} />
        <Route path="/knowledge" element={<Knowledge />} />
        <Route path="/models" element={<Models />} />
        <Route path="/mcp-market" element={<McpMarket />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/thesis" element={<Thesis />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/analysis/:ticker" element={<StockAnalysis />} />
        <Route path="/research" element={<ResearchWorkspace />} />
        <Route path="/research/reports" element={<Research />} />
        <Route path="/research/:symbol" element={<ResearchWorkspace />} />
        <Route path="/compare" element={<ComparisonWorkspace />} />
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

function AuthGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const status = useAuthStore((state) => state.status);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const initialize = useAuthStore((state) => state.initialize);
  const clear = useAuthStore((state) => state.clear);

  useEffect(() => { void initialize(); }, [initialize]);
  useEffect(() => {
    const unauthorized = () => {
      clear();
      if (location.pathname !== '/login') {
        navigate('/login', { replace: true, state: { from: location.pathname + location.search } });
      }
    };
    window.addEventListener('finquant:unauthorized', unauthorized);
    return () => window.removeEventListener('finquant:unauthorized', unauthorized);
  }, [clear, location.pathname, location.search, navigate]);

  if (status === 'idle' || status === 'loading') {
    return <div className="auth-loading"><Spin size="large" /></div>;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return children;
}

function AppRoutes({ isDark, onToggleTheme }: AppLayoutProps) {
  return (
    <Suspense fallback={<div className="auth-loading"><Spin size="large" /></div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="*"
          element={(
            <AuthGate>
              <AppLayout isDark={isDark} onToggleTheme={onToggleTheme} />
            </AuthGate>
          )}
        />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('finquant_theme') === 'dark');
  const [layoutDensity, setLayoutDensity] = useState(() => readProfessionalPreferences().layoutDensity);

  useEffect(() => {
    const refresh = () => setLayoutDensity(readProfessionalPreferences().layoutDensity);
    const refreshFromStorage = (event: StorageEvent) => {
      if (event.key === PROFESSIONAL_PREFERENCES_KEY) refresh();
    };
    window.addEventListener(PROFESSIONAL_PREFERENCES_EVENT, refresh);
    window.addEventListener('storage', refreshFromStorage);
    return () => {
      window.removeEventListener(PROFESSIONAL_PREFERENCES_EVENT, refresh);
      window.removeEventListener('storage', refreshFromStorage);
    };
  }, []);

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
      componentSize={layoutDensity === 'compact' ? 'small' : 'middle'}
      theme={{
        algorithm: isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
      }}
    >
      <div className={`${isDark ? 'app-theme app-theme--dark' : 'app-theme'} app-density--${layoutDensity}`}>
        <BrowserRouter>
          <AppRoutes isDark={isDark} onToggleTheme={toggleTheme} />
        </BrowserRouter>
      </div>
    </ConfigProvider>
  );
}
