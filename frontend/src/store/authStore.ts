import { create } from 'zustand';
import {
  getCurrentUser,
  logoutSession,
  verifyLoginCode,
  type AuthUser,
} from '../services/authApi';

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'anonymous' | 'unavailable';

interface AuthStore {
  user: AuthUser | null;
  isAuthenticated: boolean;
  status: AuthStatus;
  initialize: () => Promise<void>;
  /** VS11：`unavailable`（本机服务未就绪）时的手动重试入口，重新发起一次探测。 */
  retry: () => Promise<void>;
  login: (email: string, code: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  clear: () => void;
}

/**
 * VS11 重试策略：`/auth/me` 的网络错误 / 5xx / 超时视为「服务未就绪」，
 * 做有限次自动重试后仍失败才落到 `unavailable`（此前一律落到 `anonymous`，
 * 于是被 AuthGate 送进本地模式下永远无法通过的邮箱登录页）。
 *
 * `maxAttempts` 是**总尝试次数**（1 次初始探测 + 2 次自动重试 = 3 次），
 * 对应验收标准「连续失败 3 次 → unavailable」。
 * `sleep` 可注入，测试用假实现避免真实等待 1s。
 */
export interface AuthRetryPolicy {
  maxAttempts: number;
  delayMs: number;
  sleep: (ms: number) => Promise<void>;
}

export const authRetryPolicy: AuthRetryPolicy = {
  maxAttempts: 3,
  delayMs: 1000,
  sleep: (ms) => new Promise<void>((resolve) => { setTimeout(resolve, ms); }),
};

/** 恢复出厂设置；测试在 afterEach 里用它避免污染其它用例。 */
export function resetAuthRetryPolicy(): void {
  authRetryPolicy.maxAttempts = 3;
  authRetryPolicy.delayMs = 1000;
  authRetryPolicy.sleep = (ms) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });
}

/** 401/403 = 确实需要登录（保持既有行为 → 跳 /login，不重试）。 */
function isAuthRequired(error: unknown): boolean {
  const status = (error as { status?: unknown } | null | undefined)?.status;
  return status === 401 || status === 403;
}

function isAuthUser(value: unknown): value is AuthUser {
  return Boolean(value) && typeof value === 'object' && typeof (value as AuthUser).id === 'number';
}

let initialization: Promise<void> | null = null;

export const useAuthStore = create<AuthStore>((set, get) => {
  /**
   * 探测当前会话。
   * - 成功 → authenticated
   * - 401/403 → anonymous（立即返回，不重试）
   * - 无 status / status ≥ 500 / 响应体异常 → 按策略重试，耗尽后 unavailable
   */
  async function loadSession(): Promise<void> {
    for (let attempt = 1; attempt <= authRetryPolicy.maxAttempts; attempt += 1) {
      try {
        const user = await getCurrentUser();
        if (isAuthUser(user)) {
          set({ user, isAuthenticated: true, status: 'authenticated' });
          return;
        }
        // 200 但响应体异常：不得因此跳登录页，归入「服务未就绪」。
      } catch (error: unknown) {
        if (isAuthRequired(error)) {
          set({ user: null, isAuthenticated: false, status: 'anonymous' });
          return;
        }
        // 其余（网络错误 / 超时 / 5xx）继续重试。
      }
      if (attempt < authRetryPolicy.maxAttempts) {
        await authRetryPolicy.sleep(authRetryPolicy.delayMs);
      }
    }
    set({ user: null, isAuthenticated: false, status: 'unavailable' });
  }

  function startProbe(): Promise<void> {
    const task = loadSession().finally(() => { initialization = null; });
    initialization = task;
    return task;
  }

  return {
    user: null,
    isAuthenticated: false,
    status: 'idle',

    initialize: async () => {
      if (get().status !== 'idle') return;
      if (initialization) return initialization;
      set({ status: 'loading' });
      return startProbe();
    },

    retry: async () => {
      if (initialization) return initialization;
      set({ status: 'loading' });
      return startProbe();
    },

    login: async (email, code) => {
      const user = await verifyLoginCode(email, code);
      set({ user, isAuthenticated: true, status: 'authenticated' });
      return user;
    },

    logout: async () => {
      try {
        await logoutSession();
      } finally {
        set({ user: null, isAuthenticated: false, status: 'anonymous' });
      }
    },

    clear: () => set({ user: null, isAuthenticated: false, status: 'anonymous' }),
  };
});
