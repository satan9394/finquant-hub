import { create } from 'zustand';
import {
  getCurrentUser,
  logoutSession,
  verifyLoginCode,
  type AuthUser,
} from '../services/authApi';

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'anonymous';

interface AuthStore {
  user: AuthUser | null;
  isAuthenticated: boolean;
  status: AuthStatus;
  initialize: () => Promise<void>;
  login: (email: string, code: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  clear: () => void;
}

let initialization: Promise<void> | null = null;

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  isAuthenticated: false,
  status: 'idle',

  initialize: async () => {
    if (get().status !== 'idle') return;
    if (initialization) return initialization;
    set({ status: 'loading' });
    initialization = getCurrentUser()
      .then((user) => set({ user, isAuthenticated: true, status: 'authenticated' }))
      .catch(() => set({ user: null, isAuthenticated: false, status: 'anonymous' }))
      .finally(() => { initialization = null; });
    return initialization;
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
}));
