// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import NotificationCenter from '../src/components/NotificationCenter';
import { LanguageProvider } from '../src/i18n/LanguageContext';

const api = vi.hoisted(() => ({
  fetch: vi.fn(),
  read: vi.fn(),
  readAll: vi.fn(),
}));

vi.mock('../src/services/notificationApi', () => ({
  fetchNotifications: api.fetch,
  markNotificationRead: api.read,
  markAllNotificationsRead: api.readAll,
}));

class EventSourceStub {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  addEventListener = vi.fn();
  close = vi.fn();
}

describe('NotificationCenter i18n', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('finquant_lang', 'en');
    api.fetch.mockResolvedValue({ items: [], unread_count: 0 });
    vi.stubGlobal('EventSource', EventSourceStub);
  });

  test('renders the global notification control in English', async () => {
    render(
      <LanguageProvider>
        <MemoryRouter><NotificationCenter /></MemoryRouter>
      </LanguageProvider>,
    );

    const trigger = await screen.findByRole('button', { name: 'Notification center, 0 unread' });
    expect(trigger.getAttribute('title')).toBe('Notifications reconnecting');
    fireEvent.click(trigger);
    expect(await screen.findByText('Notification Center')).toBeTruthy();
    expect(await screen.findByText('No notifications')).toBeTruthy();
  });
});
