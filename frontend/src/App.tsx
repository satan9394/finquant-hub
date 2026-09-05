/* ============================================================
 * App — 主应用（AntD ProLayout + 路由）
 * ============================================================ */
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Button, ConfigProvider, Spin, theme as antTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import ProLayout from '@ant-design/pro-layout';
import {
  DashboardOutlined,
  RobotOutlined,
  FundOutlined,
  WalletOutlined,
  ExperimentOutlined,
  CompassOutlined,
  RadarChartOutlined,
  DatabaseOutlined,
  SettingOutlined,
  SunOutlined,
  MoonOutlined,
  LogoutOutlined,
  CheckCircleFilled,
  ExclamationCircleFilled,
  LoadingOutlined,
} from '@ant-design/icons';
import apiClient from './services/api';
import { useModelStore } from './store/modelStore';
import ModelSelector from './components/ModelSelector';
import NotificationCenter from './components/NotificationCenter';
import CommandBar from './components/CommandBar';
import AgentRail from './components/AgentRail';
import CommandComposer from './components/CommandComposer';
import LangSwitcher from './components/LangSwitcher';
import { useAuthStore } from './store/authStore';
import { LanguageProvider, useLanguage } from './i18n/LanguageContext';
import { translate, type Language } from './i18n';
import {
  PROFESSIONAL_PREFERENCES_EVENT,
  PROFESSIONAL_PREFERENCES_KEY,
  readProfessionalPreferences,
} from './features/professionalPreferences';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Knowledge = lazy(() => import('./pages/Knowledge'));
const Models = lazy(() => import('./pages/Models'));
const Settings = lazy(() => import('./pages/Settings'));
const StockAnalysis = lazy(() => import('./pages/StockAnalysis'));
const ResearchWorkspace = lazy(() => import('./pages/ResearchWorkspace'));
const StrategyLab = lazy(() => import('./pages/StrategyLab'));
const Portfolio = lazy(() => import('./pages/Portfolio'));
const Discover = lazy(() => import('./pages/Discover'));
const LimitPool = lazy(() => import('./pages/LimitPool'));
const McpMarket = lazy(() => import('./pages/McpMarket'));
const Alerts = lazy(() => import('./pages/Alerts'));
const ComparisonWorkspace = lazy(() => import('./pages/ComparisonWorkspace'));

const navigationGroupDefinitions = [
  {
    key: 'today',
    nameKey: 'nav.today',
    icon: <DashboardOutlined />,
    children: [
      { key: '/', path: '/', nameKey: 'nav.today.home' },
    ],
  },
  {
    key: 'research',
    nameKey: 'nav.research',
    icon: <FundOutlined />,
    children: [
      { key: '/research', path: '/research', nameKey: 'nav.research.home' },
    ],
  },
  {
    key: 'discover',
    nameKey: 'nav.discover',
    icon: <CompassOutlined />,
    children: [
      { key: '/discover', path: '/discover', nameKey: 'nav.discover.home' },
      { key: '/discover/limit-pool', path: '/discover/limit-pool', nameKey: 'nav.discover.limitPool' },
    ],
  },
  {
    key: 'strategy',
    nameKey: 'nav.strategy',
    icon: <ExperimentOutlined />,
    children: [{ key: '/strategy-lab/ma-crossover', path: '/strategy-lab/ma-crossover', nameKey: 'nav.strategy.home' }],
  },
  {
    key: 'portfolio',
    nameKey: 'nav.portfolio',
    icon: <WalletOutlined />,
    children: [{ key: '/portfolio', path: '/portfolio', nameKey: 'nav.portfolio.home' }],
  },
  {
    key: 'monitor',
    nameKey: 'nav.monitor',
    icon: <RadarChartOutlined />,
    children: [{ key: '/alerts', path: '/alerts', nameKey: 'nav.monitor.home' }],
  },
  {
    key: 'library',
    nameKey: 'nav.library',
    icon: <DatabaseOutlined />,
    children: [{ key: '/knowledge', path: '/knowledge', nameKey: 'nav.library.home' }],
  },
  {
    key: 'settings',
    nameKey: 'nav.settings',
    icon: <SettingOutlined />,
    children: [
      { key: '/settings', path: '/settings', nameKey: 'nav.settings.home' },
      { key: '/models', path: '/models', nameKey: 'nav.settings.models' },
      { key: '/mcp-market', path: '/mcp-market', nameKey: 'nav.settings.mcp' },
    ],
  },
];

function buildNavigationGroups(lang: Language) {
  return navigationGroupDefinitions.map((group) => ({
    ...group,
    name: translate(lang, group.nameKey),
    children: group.children.map((item) => ({ ...item, name: translate(lang, item.nameKey) })),
  }));
}

export const navigationGroups = buildNavigationGroups('zh');

export const systemToolPaths = ['/models', '/mcp-market', '/settings'] as const;

export function isSystemToolPath(pathname: string): boolean {
  return systemToolPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function getMenuKey(pathname: string): string {
  if (pathname.startsWith('/research') || pathname.startsWith('/analysis') || ['/chat', '/discussion', '/thesis', '/compare'].some((path) => pathname.startsWith(path))) return '/research';
  if (pathname.startsWith('/discover/limit-pool')) return '/discover/limit-pool';
  if (pathname.startsWith('/discover') || pathname.startsWith('/screening') || pathname.startsWith('/alpha')) return '/discover';
  if (pathname.startsWith('/strategy-lab')) return '/strategy-lab/ma-crossover';
  if (pathname.startsWith('/portfolio')) return '/portfolio';
  if (pathname.startsWith('/alerts')) return '/alerts';
  if (pathname.startsWith('/knowledge')) return '/knowledge';
  if (isSystemToolPath(pathname)) return '/settings';
  return pathname === '/' ? '/' : pathname;
}

export function LegacyResearchRedirect({ mode }: { mode: 'fast' | 'deep' | 'review' | 'thesis' }) {
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  search.set('mode', mode);
  return <Navigate to={`/research?${search.toString()}`} replace />;
}

export type SystemHealthStatus = 'checking' | 'ok' | 'unavailable';

export function SystemStatusIndicator({ status, onOpen }: { status: SystemHealthStatus; onOpen: () => void }) {
  const { t } = useLanguage();
  const copyKey = status === 'ok' ? 'shell.systemOk' : status === 'checking' ? 'shell.systemChecking' : 'shell.systemUnavailable';
  const icon = status === 'ok' ? <CheckCircleFilled /> : status === 'checking' ? <LoadingOutlined spin /> : <ExclamationCircleFilled />;
  return (
    <Button
      type="text"
      className={`system-status system-status--${status}`}
      icon={icon}
      aria-live="polite"
      onClick={onOpen}
    >
      {t(copyKey)}
    </Button>
  );
}

interface AppLayoutProps {
  isDark: boolean;
  onToggleTheme: () => void;
}

function AppLayout({ isDark, onToggleTheme }: AppLayoutProps) {
  const { lang, t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const setModels = useModelStore((s) => s.setModels);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [collapsed, setCollapsed] = useState(false);
  const [agentRailOpen, setAgentRailOpen] = useState(() => typeof window.matchMedia !== 'function' || !window.matchMedia('(max-width: 820px)').matches);
  const [systemHealth, setSystemHealth] = useState<SystemHealthStatus>('checking');
  const translatedNavigation = useMemo(() => buildNavigationGroups(lang), [lang]);

  // 加载模型列表
  useEffect(() => {
    apiClient.get('/models')
      .then((res) => setModels(res.data.items))
      .catch(() => {});
  }, [setModels]);

  useEffect(() => {
    let active = true;
    apiClient.get('/health')
      .then((response) => {
        if (active) setSystemHealth(response.data?.status === 'ok' ? 'ok' : 'unavailable');
      })
      .catch(() => {
        if (active) setSystemHealth('unavailable');
      });
    return () => { active = false; };
  }, []);


  const menuKey = getMenuKey(location.pathname);
  const systemTool = isSystemToolPath(location.pathname);
  const commandContext = location.pathname.startsWith('/portfolio') ? t('nav.portfolio') : location.pathname.startsWith('/strategy-lab') ? t('nav.strategy') : location.pathname.startsWith('/analysis') || location.pathname.startsWith('/research') ? t('nav.research') : undefined;

  return (
    <ProLayout
      title={t('app.title')}
      logo="/favicon.svg"
      layout="side"
      navTheme={isDark ? 'realDark' : 'light'}
      contentStyle={{ background: 'var(--fq-bg-page)', minHeight: 'calc(100dvh - 48px)', padding: 0 }}
      headerContentRender={() => <CommandBar onNavigate={navigate} context={commandContext} />}
      actionsRender={() => [
        <div className="app-header-actions" key="app-header-actions">
          <SystemStatusIndicator status={systemHealth} onOpen={() => navigate('/settings')} />
          <Button type="text" icon={<RobotOutlined />} aria-label={t('agent.open')} onClick={() => setAgentRailOpen((value) => !value)} />
          <LangSwitcher />
            <NotificationCenter />
            <Button
              type="text"
              aria-label={isDark ? t('shell.themeLight') : t('shell.themeDark')}
              title={isDark ? t('shell.themeLight') : t('shell.themeDark')}
              icon={isDark ? <SunOutlined /> : <MoonOutlined />}
              onClick={onToggleTheme}
            />
            {user?.local_mode ? (
              <span className="sider-actions__mode">{t('shell.localMode')}</span>
            ) : (
              <Button
                type="text"
                icon={<LogoutOutlined />}
                aria-label={`${t('shell.logout')}${user?.email ? `: ${user.email}` : ''}`}
                onClick={() => void logout()
                  .catch(() => undefined)
                  .then(() => navigate('/login', { replace: true }))}
              >
                {t('shell.logout')}
              </Button>
            )}
        </div>,
      ]}
      menuExtraRender={() => (
        <div className="model-dock">
          <RobotOutlined className="model-dock__icon" />
          <div className="model-dock__content">
            <span className="model-dock__label">{t('model.label')}</span>
            <ModelSelector />
          </div>
        </div>
      )}
      menuDataRender={() => translatedNavigation}
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
      // Astra B5：侧栏宽度与 Design System token（--fq-sidebar-expanded: 240px）
      // 及 DESIGN_SYSTEM_V1.md 规范一致；此前硬编码 224 使 token 失去尺寸权威。
      siderWidth={240}
      breakpoint="lg"
      collapsed={collapsed}
      onCollapse={setCollapsed}
    >
      <div className={`research-os-shell${agentRailOpen ? '' : ' research-os-shell--rail-closed'}`}>
        <main className="research-os-canvas">
        {systemTool && (
        <section className="system-tool-boundary" aria-label={t('shell.settingsBoundary')}>
          <div>
            <strong>{t('shell.settingsBoundary')}</strong>
            <span>{t('shell.settingsDescription')}</span>
          </div>
          <Button onClick={() => navigate('/research')}>{t('shell.backToResearch')}</Button>
        </section>
      )}
      <Suspense fallback={<div className="page-loading"><Spin /><span>{t('shell.loading')}</span></div>}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/chat" element={<LegacyResearchRedirect mode="fast" />} />
        <Route path="/discussion" element={<LegacyResearchRedirect mode="review" />} />
        <Route path="/knowledge" element={<Knowledge />} />
        <Route path="/models" element={<Models />} />
        <Route path="/mcp-market" element={<McpMarket />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/thesis" element={<LegacyResearchRedirect mode="thesis" />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/analysis/:ticker" element={<StockAnalysis />} />
        <Route path="/research" element={<ResearchWorkspace />} />
        <Route path="/research/reports" element={<LegacyResearchRedirect mode="deep" />} />
        <Route path="/research/:symbol" element={<ResearchWorkspace />} />
        <Route path="/compare" element={<ComparisonWorkspace />} />
        <Route path="/strategy-lab/ma-crossover" element={<StrategyLab />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/discover/limit-pool" element={<LimitPool />} />
        <Route path="/screening" element={<Navigate to="/discover?mode=screening" replace />} />
        <Route path="/alpha" element={<Navigate to="/discover?mode=alpha" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      <CommandComposer onSubmit={(prompt) => navigate(`/research?prompt=${encodeURIComponent(prompt)}`)} />
      </main>
      <AgentRail open={agentRailOpen} onClose={() => setAgentRailOpen(false)} />
      </div>
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
  const { t } = useLanguage();
  return (
    <Suspense fallback={<div className="auth-loading"><Spin size="large" /><span>{t('shell.loading')}</span></div>}>
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

function FinQuantApp() {
  const { lang } = useLanguage();
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
      locale={lang === 'zh' ? zhCN : enUS}
      componentSize={layoutDensity === 'compact' ? 'small' : 'middle'}
      theme={{
        algorithm: isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
        // Astra B4：此前 ConfigProvider 只切算法，AntD 组件（按钮/Tag 等）用
        // 自身主题色，与自定义 --fq-ai-primary 两套主色并存。把 AntD 语义 token
        // 映射到与 --fq-* 亮/暗一致的值，收敛为单一主色与圆角来源。
        // 值与 app.css --fq-ai-primary（亮 #315efb / 暗 #7c9bff）保持一致；
        // 圆角 8px 对齐 Design System radius-sm（DESIGN_SYSTEM_V1 §4.3）。
        token: {
          colorPrimary: isDark ? '#7c9bff' : '#315efb',
          borderRadius: 8,
          borderRadiusLG: 12,
          borderRadiusSM: 8,
          colorInfo: isDark ? '#75a7ff' : '#2561e6',
          colorSuccess: isDark ? '#5ec5a1' : '#12785f',
          colorError: isDark ? '#ff8585' : '#b42318',
          colorWarning: isDark ? '#e3b75d' : '#8f6000',
        },
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

export default function App() {
  return (
    <LanguageProvider>
      <FinQuantApp />
    </LanguageProvider>
  );
}
