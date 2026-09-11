// @vitest-environment jsdom
/* ============================================================
 * VS11 — 区分「服务未就绪」与「确实需要登录」
 *
 * 覆盖：
 *  1. api.ts 拒绝的 Error 保留 HTTP status，401 仍派发 finquant:unauthorized，
 *     且 message 形态与改动前一致；
 *  2. authStore：401/403 → anonymous（不重试）；无 status / 5xx → 有限次重试 → unavailable；
 *  3. 先失败后成功 → 自动重试进入 authenticated；
 *  4. AuthGate：unavailable 不跳 /login（渲染连接提示 + 重试按钮），401 仍跳 /login；
 *  5. Login 兜底说明与重试入口；
 *  6. i18n zh/en parity。
 *
 * 重试等待一律走注入的 sleep（tests 里替换为同步 resolve），绝不真实等待 1s。
 * ============================================================ */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import apiClient, { type ApiFailure } from '../src/services/api';
import { AuthGate } from '../src/App';
import Login from '../src/pages/Login';
import { translations } from '../src/i18n';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { authRetryPolicy, resetAuthRetryPolicy, useAuthStore } from '../src/store/authStore';

const mocks = vi.hoisted(() => ({
  requestCode: vi.fn(),
  verifyCode: vi.fn(),
  currentUser: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../src/services/authApi', () => ({
  requestLoginCode: mocks.requestCode,
  verifyLoginCode: mocks.verifyCode,
  getCurrentUser: mocks.currentUser,
  logoutSession: mocks.logout,
}));

const sleepSpy = vi.fn(async (_ms: number) => undefined);

const localUser = { id: 1, email: 'local@finquant.invalid', is_admin: true, local_mode: true };

/** 模拟 axios 的 HTTP 失败（带 status）。 */
function httpError(status: number, message = `HTTP ${status}`) {
  return Object.assign(new Error(message), { status });
}

/** 模拟网络错误 / 超时（没有 response ⇒ 没有 status）。 */
function networkError(message = 'Network Error') {
  return new Error(message);
}

function resetAuthState() {
  useAuthStore.setState({ user: null, isAuthenticated: false, status: 'idle' });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('finquant_lang', 'zh');
  resetAuthRetryPolicy();
  authRetryPolicy.sleep = sleepSpy;
  resetAuthState();
});

afterEach(() => {
  resetAuthRetryPolicy();
  resetAuthState();
});

/* ------------------------------------------------------------------ */
describe('api.ts 保留 HTTP 状态', () => {
  type Adapter = typeof apiClient.defaults.adapter;

  async function rejectWith(error: unknown) {
    const original: Adapter = apiClient.defaults.adapter;
    apiClient.defaults.adapter = async () => { throw error; };
    try {
      await apiClient.get('/auth/me');
      throw new Error('应当 reject');
    } catch (failure) {
      return failure as ApiFailure;
    } finally {
      apiClient.defaults.adapter = original;
    }
  }

  it('5xx：失败对象带 status=500，message 取后端 detail', async () => {
    const failure = await rejectWith({
      message: 'Request failed with status code 500',
      isAxiosError: true,
      response: { status: 500, data: { detail: '服务未就绪' } },
    });

    expect(failure).toBeInstanceOf(Error);
    expect(failure.status).toBe(500);
    expect(failure.message).toBe('服务未就绪');
  });

  it('401：带 status=401 且仍派发 finquant:unauthorized', async () => {
    const listener = vi.fn();
    window.addEventListener('finquant:unauthorized', listener);
    try {
      const failure = await rejectWith({
        message: 'Request failed with status code 401',
        isAxiosError: true,
        response: { status: 401, data: { detail: '未登录' } },
      });

      expect(failure.status).toBe(401);
      expect(failure.message).toBe('未登录');
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('finquant:unauthorized', listener);
    }
  });

  it('网络错误：没有 status，message 保持 axios 原文', async () => {
    const failure = await rejectWith({ message: 'Network Error', isAxiosError: true });

    expect(failure).toBeInstanceOf(Error);
    expect(failure.status).toBeUndefined();
    expect(failure.message).toBe('Network Error');
  });
});

/* ------------------------------------------------------------------ */
describe('authStore 失败分类与有限重试', () => {
  it('401 → anonymous，且不重试', async () => {
    mocks.currentUser.mockRejectedValue(httpError(401, '未登录'));

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false, status: 'anonymous' });
    expect(mocks.currentUser).toHaveBeenCalledTimes(1);
    expect(sleepSpy).not.toHaveBeenCalled();
  });

  it('403 → anonymous（同样视为确实需要登录）', async () => {
    mocks.currentUser.mockRejectedValue(httpError(403, '禁止访问'));

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().status).toBe('anonymous');
    expect(mocks.currentUser).toHaveBeenCalledTimes(1);
  });

  it('500 → 重试 3 次后 unavailable（注入 sleep，不真实等待）', async () => {
    mocks.currentUser.mockRejectedValue(httpError(500, '服务未就绪'));

    await useAuthStore.getState().initialize();

    const state = useAuthStore.getState();
    expect(state.status).toBe('unavailable');
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(mocks.currentUser).toHaveBeenCalledTimes(3);
    // 3 次尝试之间只有 2 次等待，且等待时长 = 策略里的 1000ms
    expect(sleepSpy).toHaveBeenCalledTimes(2);
    expect(sleepSpy).toHaveBeenCalledWith(1000);
  });

  it('网络错误（无 status）→ 同样 unavailable，不被当作未认证', async () => {
    mocks.currentUser.mockRejectedValue(networkError('Network Error'));

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().status).toBe('unavailable');
    expect(mocks.currentUser).toHaveBeenCalledTimes(3);
  });

  it('200 但响应体异常 → 不得当作已登录，归入 unavailable', async () => {
    mocks.currentUser.mockResolvedValue(undefined as never);

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, status: 'unavailable' });
    expect(mocks.currentUser).toHaveBeenCalledTimes(3);
  });

  it('先失败后成功 → 自动重试进入 authenticated（无需手动操作）', async () => {
    mocks.currentUser.mockRejectedValueOnce(httpError(503)).mockResolvedValueOnce(localUser);

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState()).toMatchObject({
      user: localUser,
      isAuthenticated: true,
      status: 'authenticated',
    });
    expect(mocks.currentUser).toHaveBeenCalledTimes(2);
    expect(sleepSpy).toHaveBeenCalledTimes(1);
  });

  it('本地模式正常路径零回归：/auth/me 成功 → authenticated 且不重试', async () => {
    mocks.currentUser.mockResolvedValue(localUser);

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState()).toMatchObject({
      user: localUser,
      isAuthenticated: true,
      status: 'authenticated',
    });
    expect(mocks.currentUser).toHaveBeenCalledTimes(1);
    expect(sleepSpy).not.toHaveBeenCalled();
  });

  it('unavailable 后点重试会再次发起初始化，成功则进入 authenticated', async () => {
    mocks.currentUser.mockRejectedValue(httpError(500));
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().status).toBe('unavailable');
    expect(mocks.currentUser).toHaveBeenCalledTimes(3);

    // mockResolvedValue 覆盖默认实现但保留调用历史，因此这里能直接对比总次数
    mocks.currentUser.mockResolvedValue(localUser);
    await useAuthStore.getState().retry();

    expect(useAuthStore.getState()).toMatchObject({ user: localUser, status: 'authenticated' });
    expect(mocks.currentUser).toHaveBeenCalledTimes(4);
  });
});

/* ------------------------------------------------------------------ */
function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderGate() {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={['/']}>
        <LocationProbe />
        <Routes>
          <Route path="/login" element={<div>登录页占位</div>} />
          <Route
            path="/"
            element={(
              <AuthGate>
                <div>受保护内容</div>
              </AuthGate>
            )}
          />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );
}

describe('AuthGate 区分 unavailable 与 anonymous', () => {
  it('5xx → 渲染「正在连接本机服务」+ 重试按钮，不发生跳转 /login', async () => {
    mocks.currentUser.mockRejectedValue(httpError(500, '服务未就绪'));
    resetAuthState();

    renderGate();

    expect(await screen.findByTestId('auth-unavailable')).toBeTruthy();
    expect(screen.getByText('正在连接本机服务…')).toBeTruthy();
    expect(screen.getByRole('button', { name: '重试连接' })).toBeTruthy();
    expect(screen.queryByText('登录页占位')).toBeNull();
    expect(screen.queryByText('受保护内容')).toBeNull();
    expect(screen.getByTestId('location').textContent).toBe('/');
  });

  it('网络错误 → 同样停留在原路由（不跳 /login）', async () => {
    mocks.currentUser.mockRejectedValue(networkError());
    resetAuthState();

    renderGate();

    expect(await screen.findByTestId('auth-unavailable')).toBeTruthy();
    expect(screen.queryByText('登录页占位')).toBeNull();
    expect(screen.getByTestId('location').textContent).toBe('/');
  });

  it('点重试按钮会再次初始化，成功后进入受保护内容', async () => {
    mocks.currentUser.mockRejectedValue(httpError(500));
    resetAuthState();

    renderGate();
    await screen.findByTestId('auth-unavailable');

    mocks.currentUser.mockResolvedValue(localUser);
    fireEvent.click(screen.getByRole('button', { name: '重试连接' }));

    expect(await screen.findByText('受保护内容')).toBeTruthy();
    await waitFor(() => expect(mocks.currentUser).toHaveBeenCalledTimes(4));
    expect(screen.queryByText('登录页占位')).toBeNull();
  });

  it('401 → 仍跳转 /login（既有登录流程不回退）', async () => {
    mocks.currentUser.mockRejectedValue(httpError(401, '未登录'));
    resetAuthState();

    renderGate();

    expect(await screen.findByText('登录页占位')).toBeTruthy();
    expect(screen.queryByTestId('auth-unavailable')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/login'));
  });
});

/* ------------------------------------------------------------------ */
describe('Login 兜底说明', () => {
  it('给出本机模式说明，点重试连接可重新初始化并进入应用', async () => {
    useAuthStore.setState({ user: null, isAuthenticated: false, status: 'anonymous' });
    mocks.currentUser.mockResolvedValue(localUser);

    render(
      <LanguageProvider>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<div>首页占位</div>} />
          </Routes>
        </MemoryRouter>
      </LanguageProvider>,
    );

    expect(screen.getByText(/通常无需登录/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('login-retry-connection'));

    expect(await screen.findByText('首页占位')).toBeTruthy();
    expect(mocks.currentUser).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ */
describe('i18n parity', () => {
  it('zh/en 键集合一致，且 VS11 新键双语齐备', () => {
    expect(Object.keys(translations.en).sort()).toEqual(Object.keys(translations.zh).sort());

    const vs11Keys = [
      'auth.unavailable.title',
      'auth.unavailable.hint',
      'auth.unavailable.retry',
      'auth.localFallback.title',
      'auth.localFallback.body',
      'auth.localFallback.retry',
    ];
    for (const key of vs11Keys) {
      expect(translations.zh[key], `zh missing ${key}`).toBeTruthy();
      expect(translations.en[key], `en missing ${key}`).toBeTruthy();
    }
  });
});
