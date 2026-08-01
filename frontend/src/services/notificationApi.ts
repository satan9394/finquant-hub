import apiClient from './api';
import type { AppNotification } from '../features/notifications/state';

export interface NotificationListResponse {
  items: AppNotification[];
  unread_count: number;
}

export async function fetchNotifications(limit = 50): Promise<NotificationListResponse> {
  const response = await apiClient.get('/notifications', { params: { limit } });
  return response.data;
}

export async function markNotificationRead(notificationId: number): Promise<void> {
  await apiClient.post(`/notifications/${notificationId}/read`);
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiClient.post('/notifications/read-all');
}
