import { Button } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import GlobalTaskEntry, { GLOBAL_TASK_OPEN_EVENT } from './GlobalTaskEntry';
import { useLanguage } from '../i18n/LanguageContext';

interface CommandBarProps {
  onNavigate: (path: string) => void;
  context?: string;
  variant?: 'hero' | 'inline';
  /**
   * BACKLOG-032 Step A：triggerOnly = 只渲染"输入框形态"的触发按钮，点击时
   * dispatch 全局打开事件，由 header 内唯一 GlobalTaskEntry 实例弹起同一弹窗。
   * 用于 Dashboard hero：不再内嵌第二个可弹窗实例（也就没有第二个 ⌘K 监听/
   * 第二个 Modal），首页与 header 共用同一个全局提问弹窗。
   */
  triggerOnly?: boolean;
}

/**
 * Shared AI-first entry point. The non-triggerOnly variant owns the single
 * GlobalTaskEntry instance (header) which registers for the global open event;
 * the triggerOnly variant (hero) dispatches that event so every entry point
 * opens the same single modal.
 */
export default function CommandBar({ onNavigate, context, variant = 'inline', triggerOnly = false }: CommandBarProps) {
  const { t } = useLanguage();
  const openGlobalEntry = () => window.dispatchEvent(new Event(GLOBAL_TASK_OPEN_EVENT));
  return (
    <div className={`command-bar command-bar--${variant}`} data-context={context || undefined}>
      {triggerOnly ? (
        <Button
          className="global-task-entry-trigger"
          icon={<SearchOutlined />}
          aria-haspopup="dialog"
          aria-label={t('command.open')}
          onClick={openGlobalEntry}
        >
          <span className="global-task-entry-trigger__label">{t('command.placeholder')}</span>
          <span className="global-task-entry-trigger__shortcut" aria-hidden="true">⌘K</span>
        </Button>
      ) : (
        <GlobalTaskEntry onNavigate={onNavigate} />
      )}
      {context ? <span className="command-bar__context" aria-label={t('command.currentContext', { context })}>{context}</span> : null}
    </div>
  );
}
