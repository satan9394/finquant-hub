/* ============================================================
 * RoleAvatar — 角色头像组件
 * ============================================================ */
import { Avatar } from 'antd';
import type { AvatarProps } from 'antd';

interface RoleAvatarProps extends AvatarProps {
  avatar?: string;
  name?: string;
  pulsing?: boolean;
}

const colorMap: Record<string, string> = {
  value_investor: '#722ed1',
  tech_analyst: '#1890ff',
  quant_researcher: '#13c2c2',
  risk_manager: '#fa8c16',
  macro_strategist: '#eb2f96',
  sentiment_analyst: '#52c41a',
};

const defaultIcons: Record<string, string> = {
  value_investor: '🏛️',
  tech_analyst: '📊',
  quant_researcher: '📐',
  risk_manager: '🛡️',
  macro_strategist: '🌍',
  sentiment_analyst: '📈',
};

export default function RoleAvatar({ avatar, name, pulsing, ...rest }: RoleAvatarProps) {
  const roleKey = name?.toLowerCase().replace(/\s+/g, '_') || '';
  const bgColor = colorMap[roleKey] || '#666';
  const icon = avatar || defaultIcons[roleKey] || '🤖';

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <Avatar
        {...rest}
        style={{
          backgroundColor: bgColor,
          verticalAlign: 'middle',
          animation: pulsing ? 'pulse 1.5s ease-in-out infinite' : undefined,
          ...rest.style,
        }}
      >
        {icon}
      </Avatar>
      {name && <span style={{ fontSize: 11, color: '#888' }}>{name}</span>}
      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(24, 144, 255, 0.4); }
          50% { box-shadow: 0 0 0 8px rgba(24, 144, 255, 0); }
        }
      `}</style>
    </div>
  );
}
