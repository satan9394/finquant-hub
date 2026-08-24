/* ============================================================
 * ChatMessageBubble — 消息气泡（单聊/讨论复用）
 * ============================================================ */
import { Typography } from 'antd';
import dayjs from 'dayjs';
import RoleAvatar from './RoleAvatar';
import StreamingText from './StreamingText';
import type { Message } from '../types';

const { Text } = Typography;

interface ChatMessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  streamingContent?: string;
}

export default function ChatMessageBubble({ message, isStreaming, streamingContent }: ChatMessageBubbleProps) {
  const isUser = message.role === 'user';
  const isAgent = message.role === 'agent';
  const displayContent = isStreaming ? (streamingContent || '') : message.content;
  const timeStr = message.created_at ? dayjs(message.created_at).format('MM-DD HH:mm') : '';

  return (
    <div style={{
      display: 'flex',
      flexDirection: isUser ? 'row-reverse' : 'row',
      gap: 10,
      marginBottom: 16,
      padding: '0 16px',
    }}>
      {/* 头像 */}
      {isAgent ? (
        <RoleAvatar
          avatar={undefined}
          name={message.agent_name || undefined}
          size={36}
          pulsing={isStreaming}
        />
      ) : (
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: isUser ? 'var(--fq-ai-primary)' : '#52c41a',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 16, flexShrink: 0,
        }}>
          {isUser ? 'U' : 'AI'}
        </div>
      )}

      {/* 气泡 */}
      <div style={{
        maxWidth: '70%',
        minWidth: 60,
      }}>
        {/* 角色名 */}
        {isAgent && message.agent_name && (
          <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>
            {message.agent_name}
          </div>
        )}

        <div style={{
          padding: '10px 14px',
          borderRadius: 12,
          background: isUser ? '#e6f7ff' : '#f5f5f5',
          border: '1px solid',
          borderColor: isUser ? '#91d5ff' : '#e8e8e8',
          fontSize: 14,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {isStreaming ? (
            <StreamingText content={displayContent} />
          ) : (
            displayContent
          )}
        </div>

        {/* 时间戳 + token */}
        <div style={{
          fontSize: 11,
          color: '#aaa',
          marginTop: 4,
          textAlign: isUser ? 'right' : 'left',
        }}>
          {timeStr}
          {message.token_count != null && ` · ${message.token_count} tokens`}
          {isStreaming && ' · 输入中...'}
        </div>
      </div>
    </div>
  );
}
