/* ============================================================
 * API Client — axios 实例 + 统一错误处理
 * ============================================================ */
import axios from 'axios';

const apiClient = axios.create({
  baseURL: '/api',
  timeout: 30000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * 统一失败对象：`message` 形态与改动前完全一致（既有调用方依赖它），
 * 额外附带 HTTP 状态，供调用方区分「401 需要登录」与「服务未就绪」。
 * 网络错误 / 超时没有响应，`status` 为 undefined。
 */
export interface ApiFailure extends Error {
  status?: number;
}

function readStatus(error: unknown): number | undefined {
  const response = (error as { response?: { status?: unknown } } | null | undefined)?.response;
  const status = response?.status;
  return typeof status === 'number' ? status : undefined;
}

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = readStatus(error);
    if (status === 401) {
      window.dispatchEvent(new Event('finquant:unauthorized'));
    }
    const message = error.response?.data?.detail || error.message || '请求失败';
    const failure: ApiFailure = new Error(message);
    if (status !== undefined) failure.status = status;
    return Promise.reject(failure);
  }
);

export default apiClient;
