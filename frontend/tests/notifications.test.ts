import { describe, expect, test } from 'vitest';
import {
  countUnreadNotifications,
  markAllNotificationsReadLocal,
  markNotificationReadLocal,
  mergeNotifications,
  type AppNotification,
} from '../src/features/notifications/state';

function notification(id: number, isRead = false): AppNotification {
  return {
    id,
    event_type: 'test.completed',
    title: `通知 ${id}`,
    body: '正文',
    severity: 'success',
    source_type: 'test',
    source_id: String(id),
    payload: { url: '/' },
    is_read: isRead,
    created_at: '2026-07-30 00:00:00',
  };
}

describe('notification state', () => {
  test('merges, deduplicates and keeps newest notifications first', () => {
    const result = mergeNotifications(
      [notification(2), notification(1)],
      [notification(2, true), notification(3)],
    );

    expect(result.map((item) => item.id)).toEqual([3, 2, 1]);
    expect(result[1].is_read).toBe(true);
    expect(countUnreadNotifications(result)).toBe(2);
  });

  test('marks one or every notification read immutably', () => {
    const original = [notification(2), notification(1)];
    const oneRead = markNotificationReadLocal(original, 2);
    const allRead = markAllNotificationsReadLocal(oneRead);

    expect(original[0].is_read).toBe(false);
    expect(oneRead.map((item) => item.is_read)).toEqual([true, false]);
    expect(countUnreadNotifications(allRead)).toBe(0);
  });
});
