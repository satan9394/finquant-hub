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
import GlobalTaskEntry, { GLOBAL_TASK_OPEN_EVENT } from './components/GlobalTaskEntry';
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

/**
 * VS-24：标的研究语境追问条的**规范去向**（唯一实现）。
 *
 * 追问条在 `/analysis/:ticker` 与 `/research/:symbol` 两条入口都渲染，两条入口
 * 必须落到同一个 URL：`/research/<标的>?prompt=<原问题>`。之所以抽成函数而不是
 * 各处手拼：本仓历次真缺陷多为"同一件事两条路径不同源"（一条改、另一条忘）。
 */
export function followupResearchPath(symbol: string, prompt: string): string {
  return `/research/${encodeURIComponent(symbol)}?prompt=${encodeURIComponent(prompt)}`;
}

/**
 * VS-24：追问条宿主——`/analysis/:ticker` 与 `/research/:symbol` 共用**同一个**
 * 组件、**同一个**去向函数，不写第二套实现。
 *
 * 注意：这里只负责"把原问题原样带走"；问题如何被接住由 `ResearchWorkspace`
 * 的唯一消费点决定（见该文件顶部说明）。
 */
export function FollowupComposer({ symbol }: { symbol: string }) {
  const navigate = useNavigate();
  return (
    <CommandComposer
      contextLabel={symbol}
      onSubmit={(prompt) => navigate(followupResearchPath(symbol, prompt))}
    />
  );
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
  // Astra B12（BACKLOG-032 Step C）：AgentRail 四标签空态默认折叠——桌面也不再
  // 默认展开占 376px 右栏。真实阶段由内容区呈现（deep 研究 AgentStatusCard、
  // analyst SwarmStatusCard 等），右侧收起经 .research-os-shell--rail-closed
  // 列宽归 0，空 Rail 不占宽。header Robot 按钮仍可手动打开。
  const [agentRailOpen, setAgentRailOpen] = useState(false);
  const [systemHealth, setSystemHealth] = useState<SystemHealthStatus>('checking');
  const translatedNavigation = useMemo(() => buildNavigationGroups(lang), [lang]);

  // 加载模型列表
  useEffect(() => {
    apiClient.get('/models')
      .then((res) => setModels(res.data.items))
      .catch(() => {});
  }, [setModels]);

  // BACKLOG-032 Step A：⌘K 注册收敛到 App 层一次（header 内是唯一常驻
  // GlobalTaskEntry 实例）。此前 GlobalTaskEntry 每实例向 window 注册
  // keydown，首页 header+hero 并存两份监听。现在只有这一个 listener，
  // dispatch 全局打开事件，让唯一实例弹窗。
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        window.dispatchEvent(new Event(GLOBAL_TASK_OPEN_EVENT));
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

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

  // BACKLOG-032 Step B：底部 Composer 不再是"全局恒在"的第二提问入口，只作为
  // 研究语境的追问条：仅在当前对象语境（/research/:symbol、/analysis/:ticker）
  // 渲染，携带当前对象；提交把原问题导航到 /research/:symbol?prompt=…，
  // 首页只保留 hero/header 的单一全局提问弹窗（Step A）。
  // VS-24：两条入口共用 FollowupComposer/followupResearchPath（同一个去向），
  // 问题如何被接住由 ResearchWorkspace 的唯一消费点负责——"导航到同一 URL"
  // 不等于"被接住"：同一 Route 只改查询串不会重挂载，这正是本卡修的核心缺陷。
  const objectMatch = location.pathname.match(/^\/(?:research|analysis)\/([^/]+)/);
  const followupSymbol = objectMatch && objectMatch[1] !== 'reports' ? decodeURIComponent(objectMatch[1]) : undefined;

  return (
    <ProLayout
      title={t('app.title')}
      logo="/favicon.svg"
      layout="side"
      navTheme={isDark ? 'realDark' : 'light'}
      contentStyle={{ background: 'var(--fq-bg-page)', minHeight: 'calc(100dvh - 48px)', padding: 0 }}
      headerContentRender={() => <CommandBar onNavigate={navigate} context={commandContext} triggerOnly />}
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
      {followupSymbol ? (
        <FollowupComposer symbol={followupSymbol} />
      ) : null}
      </main>
      <AgentRail open={agentRailOpen} onClose={() => setAgentRailOpen(false)} />
      </div>
      {/* BACKLOG-032 Step A：唯一全局提问弹窗宿主（hideTrigger，不自带触发按钮）。
          实际触发入口=header CommandBar + Dashboard hero 的 triggerOnly 按钮与
          App 层 ⌘K——三者都 dispatch GLOBAL_TASK_OPEN_EVENT，由本宿主单实例
          弹起同一 Modal。放 ProLayout children 顶层保证任何路由都挂载。 */}
      <GlobalTaskEntry hideTrigger onNavigate={navigate} />
    </ProLayout>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const status = useAuthStore((state) => state.status);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const initialize = useAuthStore((state) => state.initialize);
  const retry = useAuthStore((state) => state.retry);
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
  // VS11：后端未就绪（网络错误 / 5xx / 超时）不等于「未登录」。
  // 本地模式下邮箱登录接口直接 404，跳 /login 是死胡同，因此这里渲染可重试的连接提示。
  if (status === 'unavailable') {
    return (
      <div className="auth-loading" role="status" data-testid="auth-unavailable">
        <Spin size="large" />
        <span>{t('auth.unavailable.title')}</span>
        <p className="auth-unavailable-hint">{t('auth.unavailable.hint')}</p>
        <Button onClick={() => { void retry(); }}>{t('auth.unavailable.retry')}</Button>
      </div>
    );
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
