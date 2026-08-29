/* Shared message bubble for single-agent chat and discussions. */
import { Typography } from 'antd';
import dayjs from 'dayjs';
import RoleAvatar from './RoleAvatar';
import StreamingText from './StreamingText';
import type { Message } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

const { Text } = Typography;

interface ChatMessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  streamingContent?: string;
}

export default function ChatMessageBubble({ message, isStreaming, streamingContent }: ChatMessageBubbleProps) {
  const { t } = useLanguage();
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
      {/* Avatar */}
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
          background: isUser ? 'var(--fq-ai-primary)' : 'var(--fq-opportunity)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--fq-surface-1)', fontSize: 16, flexShrink: 0,
        }}>
          {isUser ? 'U' : 'AI'}
        </div>
      )}

      {/* Bubble */}
      <div style={{
        maxWidth: '70%',
        minWidth: 60,
      }}>
        {/* Role */}
        {isAgent && message.agent_name && (
          <div style={{ fontSize: 12, color: 'var(--fq-text-tertiary)', marginBottom: 4 }}>
            {message.agent_name}
          </div>
        )}

        <div style={{
          padding: '10px 14px',
          borderRadius: 'var(--fq-radius-md)',
          background: isUser ? 'var(--fq-ai-soft)' : 'var(--fq-bg-subtle)',
          border: '1px solid',
          borderColor: isUser ? 'var(--fq-ai-primary)' : 'var(--fq-border)',
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

        {/* Timestamp and token count */}
        <div style={{
          fontSize: 11,
          color: 'var(--fq-text-tertiary)',
          marginTop: 4,
          textAlign: isUser ? 'right' : 'left',
        }}>
          {timeStr}
          {message.token_count != null && ` · ${t('chatBubble.tokens', { count: message.token_count })}`}
          {isStreaming && ` · ${t('chatBubble.typing')}`}
        </div>
      </div>
    </div>
  );
}
