import apiClient from './api';

export interface AuthUser {
  id: number;
  email: string;
  is_admin: boolean;
  local_mode?: boolean;
}

export async function requestLoginCode(email: string): Promise<{ message: string; cooldown_seconds: number }> {
  const response = await apiClient.post('/auth/request-code', { email });
  return response.data;
}

export async function verifyLoginCode(email: string, code: string): Promise<AuthUser> {
  const response = await apiClient.post('/auth/verify-code', { email, code });
  return response.data.user;
}

export async function getCurrentUser(): Promise<AuthUser> {
  const response = await apiClient.get('/auth/me');
  return response.data.user;
}

export async function logoutSession(): Promise<void> {
  await apiClient.post('/auth/logout');
}
