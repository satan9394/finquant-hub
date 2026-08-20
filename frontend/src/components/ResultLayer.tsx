import { useId, type ReactNode } from 'react';

type ResultLayerKind = 'summary' | 'evidence' | 'method';

const layerCopy: Record<ResultLayerKind, { index: string; title: string; description: string }> = {
  summary: { index: '01', title: '摘要', description: '先看结论、主要风险和下一步。' },
  evidence: { index: '02', title: '证据', description: '用图表、指标和反面信息核对结论。' },
  method: { index: '03', title: '方法与来源', description: '查看参数、口径、来源、截止时间和质量状态。' },
};

interface ResultLayerProps {
  layer: ResultLayerKind;
  children: ReactNode;
  title?: string;
  description?: string;
  actions?: ReactNode;
}

export default function ResultLayer({ layer, children, title, description, actions }: ResultLayerProps) {
  const headingId = useId();
  const copy = layerCopy[layer];
  return (
    <section className={`result-layer result-layer--${layer}`} data-result-layer={layer} aria-labelledby={headingId}>
      <header className="result-layer__header">
        <span className="result-layer__index" aria-hidden="true">{copy.index}</span>
        <div className="result-layer__heading">
          <h3 id={headingId}>{title ?? copy.title}</h3>
          <p>{description ?? copy.description}</p>
        </div>
        {actions && <div className="result-layer__actions">{actions}</div>}
      </header>
      <div className="result-layer__body">{children}</div>
    </section>
  );
}
