import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge, Button, Empty, List, Popover, Space, Spin, Tag, Typography, message,
} from 'antd';
import { BellOutlined, CheckOutlined, DesktopOutlined } from '@ant-design/icons';
import {
  countUnreadNotifications,
  markAllNotificationsReadLocal,
  markNotificationReadLocal,
  mergeNotifications,
  type AppNotification,
  type NotificationSeverity,
} from '../features/notifications/state';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notificationApi';
import { useLanguage } from '../i18n/LanguageContext';

const { Text } = Typography;

const SEVERITY_COLOR: Record<NotificationSeverity, string> = {
  info: 'blue',
  success: 'green',
  warning: 'gold',
  error: 'red',
};

type DesktopPermission = NotificationPermission | 'unsupported';
type StreamStatus = 'connecting' | 'connected' | 'reconnecting';

function desktopPermission(): DesktopPermission {
  return typeof window !== 'undefined' && 'Notification' in window
    ? window.Notification.permission
    : 'unsupported';
}

function formatCreatedAt(value: string, lang: 'zh' | 'en'): string {
  const iso = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US');
}

export default function NotificationCenter() {
  const { lang, t } = useLanguage();
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState<DesktopPermission>(desktopPermission);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('connecting');
  const seenIds = useRef(new Set<number>());

  useEffect(() => {
    let disposed = false;
    let source: EventSource | null = null;
    let allowDesktop = false;

    const connect = (afterId: number) => {
      if (disposed) return;
      source = new EventSource(`/api/notifications/stream?after_id=${afterId}`);
      source.onopen = () => setStreamStatus('connected');
      source.onerror = () => setStreamStatus('reconnecting');
      source.addEventListener('notification', (rawEvent) => {
        try {
          const notification = JSON.parse((rawEvent as MessageEvent<string>).data) as AppNotification;
          if (seenIds.current.has(notification.id)) return;
          seenIds.current.add(notification.id);
          setItems((current) => mergeNotifications(current, notification));

          if (
            desktopPermission() === 'granted'
            && document.visibilityState !== 'visible'
            && allowDesktop
          ) {
            const desktop = new window.Notification(notification.title, {
              body: notification.body,
              icon: '/favicon.svg',
              tag: `finquant-${notification.id}`,
            });
            desktop.onclick = () => {
              window.focus();
              const url = notification.payload.url;
              if (typeof url === 'string') navigate(url);
              desktop.close();
            };
          }
        } catch {
          // Ignore malformed third-party/proxy frames; EventSource will continue.
        }
      });
    };

    const bootstrap = async () => {
      let latestId = 0;
      try {
        const response = await fetchNotifications();
        if (disposed) return;
        allowDesktop = true;
        setItems(response.items);
        for (const item of response.items) {
          seenIds.current.add(item.id);
          latestId = Math.max(latestId, item.id);
        }
      } catch (error) {
        if (!disposed) message.error(error instanceof Error ? error.message : t('notifications.error.load'));
      } finally {
        if (!disposed) {
          setLoading(false);
          connect(latestId);
        }
      }
    };

    void bootstrap();
    return () => {
      disposed = true;
      source?.close();
    };
  }, [navigate, t]);

  const requestDesktopPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      setPermission('unsupported');
      return;
    }
    const result = await window.Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') message.success(t('notifications.desktop.enabled'));
    if (result === 'denied') message.warning(t('notifications.desktop.deniedHelp'));
  }, [t]);

  const openNotification = useCallback(async (notification: AppNotification) => {
    if (!notification.is_read) {
      try {
        await markNotificationRead(notification.id);
        setItems((current) => markNotificationReadLocal(current, notification.id));
      } catch (error) {
        message.error(error instanceof Error ? error.message : t('notifications.error.update'));
      }
    }
    const url = notification.payload.url;
    if (typeof url === 'string') navigate(url);
  }, [navigate, t]);

  const readAll = useCallback(async () => {
    try {
      await markAllNotificationsRead();
      setItems(markAllNotificationsReadLocal);
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('notifications.error.update'));
    }
  }, [t]);

  const unread = countUnreadNotifications(items);
  const permissionControl = permission === 'default'
    ? (
      <Button size="small" icon={<DesktopOutlined />} onClick={() => void requestDesktopPermission()}>
        {t('notifications.desktop.enable')}
      </Button>
    )
    : permission === 'granted'
      ? <Tag color="green" icon={<CheckOutlined />}>{t('notifications.desktop.enabled')}</Tag>
      : <Text type="secondary">{permission === 'denied' ? t('notifications.desktop.denied') : t('notifications.desktop.unsupported')}</Text>;

  const content = (
    <div style={{ width: 360, maxWidth: 'calc(100vw - 48px)' }} data-testid="notification-center-panel">
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 10 }}>
        {permissionControl}
        <Button type="link" size="small" disabled={unread === 0} onClick={() => void readAll()}>
          {t('notifications.markAllRead')}
        </Button>
      </Space>
      {loading ? (
        <div style={{ padding: 24, textAlign: 'center' }}><Spin size="small" /></div>
      ) : items.length > 0 ? (
        <List
          size="small"
          style={{ maxHeight: 420, overflowY: 'auto' }}
          dataSource={items.slice(0, 20)}
          renderItem={(item) => (
            <List.Item style={{ padding: 0 }}>
              <Button
                type="text"
                block
                onClick={() => void openNotification(item)}
                style={{ height: 'auto', padding: '10px 8px', textAlign: 'left', whiteSpace: 'normal' }}
              >
                <Space direction="vertical" size={3} style={{ width: '100%' }}>
                  <Space wrap>
                    {!item.is_read ? <Badge status="processing" /> : null}
                    <Text strong={!item.is_read}>{item.title}</Text>
                    <Tag color={SEVERITY_COLOR[item.severity]}>{t(`notifications.severity.${item.severity}`)}</Tag>
                  </Space>
                  <Text type="secondary">{item.body}</Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>{formatCreatedAt(item.created_at, lang)}</Text>
                </Space>
              </Button>
            </List.Item>
          )}
        />
      ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('notifications.empty')} />}
    </div>
  );

  return (
    <Popover title={t('notifications.title')} content={content} trigger="click" placement="bottomRight">
      <Badge count={unread} size="small" overflowCount={99}>
        <Button
          type="default"
          shape="circle"
          aria-label={t('notifications.aria', { unread })}
          title={streamStatus === 'connected' ? t('notifications.connected') : t('notifications.reconnecting')}
          icon={<BellOutlined />}
        />
      </Badge>
    </Popover>
  );
}
