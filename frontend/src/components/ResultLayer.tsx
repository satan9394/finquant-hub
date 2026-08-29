import { useId, type ReactNode } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

type ResultLayerKind = 'summary' | 'evidence' | 'method';

const layerIndex: Record<ResultLayerKind, string> = { summary: '01', evidence: '02', method: '03' };

interface ResultLayerProps {
  layer: ResultLayerKind;
  children: ReactNode;
  title?: string;
  description?: string;
  actions?: ReactNode;
}

export default function ResultLayer({ layer, children, title, description, actions }: ResultLayerProps) {
  const { t } = useLanguage();
  const headingId = useId();
  return (
    <section className={`result-layer result-layer--${layer}`} data-result-layer={layer} aria-labelledby={headingId}>
      <header className="result-layer__header">
        <span className="result-layer__index" aria-hidden="true">{layerIndex[layer]}</span>
        <div className="result-layer__heading">
          <h3 id={headingId}>{title ?? t(`resultLayer.${layer}.title`)}</h3>
          <p>{description ?? t(`resultLayer.${layer}.description`)}</p>
        </div>
        {actions && <div className="result-layer__actions">{actions}</div>}
      </header>
      <div className="result-layer__body">{children}</div>
    </section>
  );
}
