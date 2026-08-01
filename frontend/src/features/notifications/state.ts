export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';

export interface AppNotification {
  id: number;
  event_type: string;
  title: string;
  body: string;
  severity: NotificationSeverity;
  source_type: string | null;
  source_id: string | null;
  payload: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

export function mergeNotifications(
  current: AppNotification[],
  incoming: AppNotification | AppNotification[],
  limit = 50,
): AppNotification[] {
  const next = new Map(current.map((item) => [item.id, item]));
  const additions = Array.isArray(incoming) ? incoming : [incoming];
  for (const item of additions) next.set(item.id, item);
  return [...next.values()].sort((left, right) => right.id - left.id).slice(0, limit);
}

export function markNotificationReadLocal(
  current: AppNotification[],
  notificationId: number,
): AppNotification[] {
  return current.map((item) => item.id === notificationId ? { ...item, is_read: true } : item);
}

export function markAllNotificationsReadLocal(current: AppNotification[]): AppNotification[] {
  return current.map((item) => item.is_read ? item : { ...item, is_read: true });
}

export function countUnreadNotifications(items: AppNotification[]): number {
  return items.reduce((count, item) => count + (item.is_read ? 0 : 1), 0);
}
