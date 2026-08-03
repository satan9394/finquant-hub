// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import Login from '../src/pages/Login';
import { useAuthStore } from '../src/store/authStore';

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

const anonymousState = {
  user: null,
  isAuthenticated: false,
  status: 'anonymous' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState(anonymousState);
});

describe('passwordless authentication', () => {
  test('restores an authenticated user from the HttpOnly-cookie session', async () => {
    const user = { id: 7, email: 'user@example.com', is_admin: false };
    mocks.currentUser.mockResolvedValue(user);
    useAuthStore.setState({ ...anonymousState, status: 'idle' });

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState()).toMatchObject({
      user,
      isAuthenticated: true,
      status: 'authenticated',
    });
  });

  test('completes the two-step login and returns to the protected route', async () => {
    mocks.requestCode.mockResolvedValue({ message: '验证码已发送', cooldown_seconds: 60 });
    mocks.verifyCode.mockResolvedValue({ id: 8, email: 'user@example.com', is_admin: false });

    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/settings' } }]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/settings" element={<div>受保护设置页</div>} />
          <Route path="/" element={<div>首页</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '获取验证码' }));
    expect(await screen.findByText(/验证码已发送至 user@example.com/)).toBeTruthy();
    expect(mocks.requestCode).toHaveBeenCalledWith('user@example.com');

    fireEvent.change(screen.getByLabelText('6 位验证码'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /登\s*录/ }));

    expect(await screen.findByText('受保护设置页')).toBeTruthy();
    await waitFor(() => expect(mocks.verifyCode).toHaveBeenCalledWith('user@example.com', '123456'));
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});
