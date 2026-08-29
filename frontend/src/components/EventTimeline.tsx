import { Timeline } from 'antd';

export interface TimelineEvent { key: string; time?: string | null; title: string; detail?: string | null; status?: 'pending' | 'complete' | 'unknown' }

export default function EventTimeline({ events }: { events: TimelineEvent[] }) {
  return <Timeline items={(events.length ? events : [{ key: 'unknown', title: 'UNKNOWN', status: 'unknown' as const }]).map((event) => ({ color: event.status === 'complete' ? 'green' : event.status === 'pending' ? 'blue' : 'gray', children: <div><strong>{event.title}</strong><small>{event.time || 'UNKNOWN'}</small><p>{event.detail || 'UNKNOWN'}</p></div> }))} />;
}
