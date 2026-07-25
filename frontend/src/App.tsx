/* ============================================================
 * App — 主应用（AntD ProLayout + 路由）
 * ============================================================ */
import { useEffect, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { ConfigProvider, theme as antTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import ProLayout, { getMenuData } from '@ant-design/pro-layout';
import {
  DashboardOutlined,
  MessageOutlined,
  TeamOutlined,
  BookOutlined,
  RobotOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import apiClient from './services/api';
import { useModelStore } from './store/modelStore';
import ModelSelector from './components/ModelSelector';

import Dashboard from './pages/Dashboard';
import Chat from './pages/Chat';
import Discussion from './pages/Discussion';
import Knowledge from './pages/Knowledge';
import Models from './pages/Models';
import Settings from './pages/Settings';

const menuItems = [
  { path: '/', name: '仪表盘', icon: <DashboardOutlined /> },
  { path: '/chat', name: '对话', icon: <MessageOutlined /> },
  { path: '/discussion', name: '讨论', icon: <TeamOutlined /> },
  { path: '/knowledge', name: '知识库', icon: <BookOutlined /> },
  { path: '/models', name: '模型', icon: <RobotOutlined /> },
  { path: '/settings', name: '设置', icon: <SettingOutlined /> },
];

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const setModels = useModelStore((s) => s.setModels);

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

  const menuKey = location.pathname === '/' ? '/' : location.pathname;

  return (
    <ProLayout
      title="FinQuant Hub"
      logo="📈"
      layout="side"
      navTheme={isDark ? 'realDark' : 'light'}
      contentStyle={{ background: '#fff' }}
      headerRender={(props) => (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          height: 48, padding: '0 24px', gap: 12,
          background: isDark ? '#141414' : '#fff',
          borderBottom: `1px solid ${isDark ? '#303030' : '#f0f0f0'}`,
        }}>
          <span style={{ fontSize: 12, color: '#888' }}>当前模型:</span>
          <ModelSelector />
        </div>
      )}
      menuDataRender={() => menuData}
      menuItemRender={(item: any, dom: any) => (
        <a onClick={() => navigate(item.path || '/')}>{dom}</a>
      )}
      location={{ pathname: menuKey }}
      siderWidth={160}
    >
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/discussion" element={<Discussion />} />
        <Route path="/knowledge" element={<Knowledge />} />
        <Route path="/models" element={<Models />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
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
