import { useId, type ReactNode } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

type StatusTone = 'neutral' | 'loading' | 'success' | 'warning' | 'error';

interface TaskPageHeaderProps {
  eyebrow: string;
  title: string;
  goal: string;
  object: ReactNode;
  status: string;
  statusTone?: StatusTone;
  actions?: ReactNode;
}

export default function TaskPageHeader({
  eyebrow,
  title,
  goal,
  object,
  status,
  statusTone = 'neutral',
  actions,
}: TaskPageHeaderProps) {
  const { t } = useLanguage();
  const titleId = useId();

  return (
    <section className="task-page-header" aria-labelledby={titleId}>
      <div className="task-page-header__copy">
        <span className="task-page-header__eyebrow">{eyebrow}</span>
        <h2 id={titleId}>{title}</h2>
        <p>{goal}</p>
        <div className="task-page-header__meta">
          <span>{t('common.currentObject')}{object}</span>
          <span className={`task-page-header__status task-page-header__status--${statusTone}`}>
            {t('common.dataStatus', { status })}
          </span>
        </div>
      </div>
      {actions && <div className="task-page-header__actions">{actions}</div>}
    </section>
  );
}
