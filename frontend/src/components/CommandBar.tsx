import GlobalTaskEntry from './GlobalTaskEntry';
import { useLanguage } from '../i18n/LanguageContext';

interface CommandBarProps {
  onNavigate: (path: string) => void;
  context?: string;
  variant?: 'hero' | 'inline';
}

/**
 * Shared AI-first entry point. GlobalTaskEntry owns the existing search and
 * routing behaviour; this component provides the design-system contract and
 * keeps page context available to assistive technology.
 */
export default function CommandBar({ onNavigate, context, variant = 'inline' }: CommandBarProps) {
  const { t } = useLanguage();
  return (
    <div className={`command-bar command-bar--${variant}`} data-context={context || undefined}>
      <GlobalTaskEntry onNavigate={onNavigate} />
      {context ? <span className="command-bar__context" aria-label={t('command.currentContext', { context })}>{context}</span> : null}
    </div>
  );
}
