import { Button } from 'antd';
import type { ReactNode } from 'react';

export interface ActionItem {
  key: string;
  label: string;
  icon?: ReactNode;
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export default function ActionBar({ actions }: { actions: ActionItem[] }) {
  return (
    <div className="action-bar">
      {actions.map((action) => (
        <Button key={action.key} type={action.primary ? 'primary' : 'default'} icon={action.icon} disabled={action.disabled} onClick={action.onClick}>
          {action.label}
        </Button>
      ))}
    </div>
  );
}
