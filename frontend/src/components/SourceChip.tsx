import { Tag, Tooltip } from 'antd';

interface SourceChipProps {
  provider?: string | null;
  asOf?: string | null;
  quality?: string | null;
}

export default function SourceChip({ provider, asOf, quality }: SourceChipProps) {
  const source = provider || 'UNKNOWN';
  return (
    <Tooltip title={[asOf && `as_of ${asOf}`, quality && `quality ${quality}`].filter(Boolean).join(' · ')}>
      <Tag className="source-chip">{source}</Tag>
    </Tooltip>
  );
}
