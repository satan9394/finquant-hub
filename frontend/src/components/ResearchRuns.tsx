import { Progress } from 'antd';
import { LoadStateView, readStateOf } from './LoadFailureAlert';
import StatusChip from './StatusChip';
import { useLanguage } from '../i18n/LanguageContext';

export interface ResearchRunItem { id: string | number; title: string; state: string; progress?: number | null; updatedAt?: string | null }

export default function ResearchRuns({ runs, error, loading, onRetry }: {
  runs: ResearchRunItem[];
  /**
   * VS22：读取失败的显式信号。`null`/`undefined` = 请求成功（此时 `runs` 为空才是"确实没有运行记录"）。
   * 故意不用"错误文案是否为空串"当判据：底层错误可能没有 message，空串会被误判成"成功"。
   */
  error?: string | null;
  /**
   * VS29：`/dashboard/stats` **还没有任何结论**（在途 / 尚未发起）。
   * 修前本组件没有加载入参 ⇒ 在途期间渲染 `<p>UNKNOWN</p>`，与"确实没有运行记录"不可区分。
   */
  loading?: boolean;
  /** 重试：必须真的重新发起 `/dashboard/stats`。失败态永远伴随一个可点的重试，不留死胡同。 */
  onRetry: () => void;
}) {
  const { t } = useLanguage();
  // VS29：三态判据统一走 readStateOf（优先级只在那里定义一次）。
  // loading=true ⇒ stillLoading ⇒ 一旦它是假且没有 error，就说明这一次读取已经有结论了。
  const state = readStateOf({
    failed: error != null,
    resolved: !loading && error == null,
    error: error ?? '',
    count: runs.length,
  });
  return <section className="today-section"><h2>{t('today.researchRuns')}</h2><div className="research-runs">
    <LoadStateView
      state={state}
      failureMessage={t('today.researchRunsFailed')}
      onRetry={onRetry}
      loadingText={t('today.runsLoading')}
      // 空态沿用修前的 `UNKNOWN` 占位：它是"确实没有运行记录"的写法，**只允许**出现在成功且为空时。
      emptyContent={<p>UNKNOWN</p>}
    >
      {runs.map((run) => <article key={run.id}><div><strong>{run.title}</strong><StatusChip label={run.state} tone={run.state === 'done' ? 'success' : run.state === 'failed' ? 'error' : 'info'} /></div>{run.progress == null ? <span>UNKNOWN</span> : <Progress percent={run.progress} size="small" />}<small>{run.updatedAt || 'UNKNOWN'}</small></article>)}
    </LoadStateView>
  </div></section>;
}
