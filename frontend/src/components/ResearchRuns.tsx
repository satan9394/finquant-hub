import { Progress } from 'antd';
import LoadFailureAlert from './LoadFailureAlert';
import StatusChip from './StatusChip';
import { useLanguage } from '../i18n/LanguageContext';

export interface ResearchRunItem { id: string | number; title: string; state: string; progress?: number | null; updatedAt?: string | null }

export default function ResearchRuns({ runs, error, onRetry }: {
  runs: ResearchRunItem[];
  /**
   * VS22：读取失败的显式信号。`null`/`undefined` = 请求成功（此时 `runs` 为空才是"确实没有运行记录"）。
   * 故意不用"错误文案是否为空串"当判据：底层错误可能没有 message，空串会被误判成"成功"。
   */
  error?: string | null;
  /** 重试：必须真的重新发起 `/dashboard/stats`。失败态永远伴随一个可点的重试，不留死胡同。 */
  onRetry: () => void;
}) {
  const { t } = useLanguage();
  return <section className="today-section"><h2>{t('today.researchRuns')}</h2><div className="research-runs">{error != null ? <LoadFailureAlert message={t('today.researchRunsFailed')} error={error} onRetry={onRetry} /> : runs.length ? runs.map((run) => <article key={run.id}><div><strong>{run.title}</strong><StatusChip label={run.state} tone={run.state === 'done' ? 'success' : run.state === 'failed' ? 'error' : 'info'} /></div>{run.progress == null ? <span>UNKNOWN</span> : <Progress percent={run.progress} size="small" />}<small>{run.updatedAt || 'UNKNOWN'}</small></article>) : <p>UNKNOWN</p>}</div></section>;
}
