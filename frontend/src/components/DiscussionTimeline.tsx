/* ============================================================
 * DiscussionTimeline — 讨论时间线组件
 * ============================================================ */
import { Timeline, Typography, Card } from 'antd';
import RoleAvatar from './RoleAvatar';
import type { Message, DiscussionRoom } from '../types';

const { Text, Paragraph } = Typography;

interface DiscussionTimelineProps {
  room: DiscussionRoom | null;
  messages: Message[];
  currentAgent?: string;
}

export default function DiscussionTimeline({ room, messages, currentAgent }: DiscussionTimelineProps) {
  if (!room) {
    return (
      <div style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>
        请选择或创建一个讨论房间
      </div>
    );
  }

  // 按 round_number 分组
  const roundMap = new Map<number, Message[]>();
  messages.forEach((m) => {
    const r = m.round_number || 0;
    if (!roundMap.has(r)) roundMap.set(r, []);
    roundMap.get(r)!.push(m);
  });

  const rounds = Array.from(roundMap.entries()).sort(([a], [b]) => a - b);

  // 按 created_at 构建时间线
  const timelineItems = messages.map((msg) => {
    const isCurrent = currentAgent === msg.agent_name;
    return {
      key: msg.id,
      dot: (
        <RoleAvatar
          avatar={undefined}
          name={msg.agent_name || undefined}
          size={28}
          pulsing={isCurrent}
        />
      ),
      children: (
        <div style={{
          padding: '8px 12px',
          background: isCurrent ? '#e6f7ff' : '#fafafa',
          borderRadius: 8,
          border: isCurrent ? '1px solid #91d5ff' : '1px solid #f0f0f0',
        }}>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>
            {msg.agent_name} · Round {msg.round_number || 0}
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {msg.content}
          </div>
        </div>
      ),
    };
  });

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Text strong>{room.topic}</Text>
        <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
          参与角色: {room.participants.map((p) => p.name).join('、')}
          · 共 {room.total_rounds} 轮 · 状态: {room.current_phase === 'done' ? '已完成' : room.current_phase === 'failed' ? '失败，可重试' : '进行中'}
        </div>
        {room.summary && (
          <div style={{ marginTop: 8, padding: 8, background: '#fffbe6', borderRadius: 4, fontSize: 13 }}>
            <Text strong>讨论总结：</Text>
            <Paragraph style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{room.summary}</Paragraph>
          </div>
        )}
      </Card>

      <Timeline items={timelineItems} />
    </div>
  );
}
