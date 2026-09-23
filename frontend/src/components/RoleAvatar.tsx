/* ============================================================
 * RoleAvatar — 角色头像组件
 * ============================================================ */
import { Avatar } from 'antd';
import type { AvatarProps } from 'antd';
import {
  BankOutlined, BarChartOutlined, CalculatorOutlined, FileSearchOutlined,
  GlobalOutlined, LineChartOutlined, RobotOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons';

interface RoleAvatarProps extends AvatarProps {
  avatar?: string;
  name?: string;
  pulsing?: boolean;
}

const colorMap: Record<string, string> = {
  value_investor: 'var(--fq-evidence-model)',
  tech_analyst: 'var(--fq-ai-primary)',
  quant_researcher: 'var(--fq-secondary)',
  risk_manager: 'var(--fq-system-warning)',
  macro_strategist: 'var(--fq-evidence-inference)',
  sentiment_analyst: 'var(--fq-opportunity)',
};

const defaultIcons: Record<string, React.ReactNode> = {
  value_investor: <BankOutlined />,
  tech_analyst: <LineChartOutlined />,
  financial_analyst: <BarChartOutlined />,
  quant_researcher: <CalculatorOutlined />,
  risk_manager: <SafetyCertificateOutlined />,
  risk: <SafetyCertificateOutlined />,
  macro_strategist: <GlobalOutlined />,
  sentiment_analyst: <LineChartOutlined />,
  industry: <BankOutlined />,
  company_researcher: <FileSearchOutlined />,
};

export default function RoleAvatar({ avatar, name, pulsing, ...rest }: RoleAvatarProps) {
  const roleKey = name?.toLowerCase().replace(/\s+/g, '_') || '';
  const bgColor = colorMap[roleKey] || 'var(--fq-evidence-unknown)';
  const imageSrc = avatar && /^(?:https?:|data:image\/)/i.test(avatar) ? avatar : undefined;
  const icon = defaultIcons[roleKey] || <RobotOutlined />;

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <Avatar
        {...rest}
        src={imageSrc}
        icon={imageSrc ? undefined : icon}
        style={{
          backgroundColor: bgColor,
          verticalAlign: 'middle',
          animation: pulsing ? 'pulse 1.5s ease-in-out infinite' : undefined,
          ...rest.style,
        }}
      />
      {name && <span style={{ fontSize: 11, color: 'var(--fq-text-tertiary)' }}>{name}</span>}
      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--fq-ai-primary) 40%, transparent); }
          50% { box-shadow: 0 0 0 8px color-mix(in srgb, var(--fq-ai-primary) 0%, transparent); }
        }
      `}</style>
    </div>
  );
}
