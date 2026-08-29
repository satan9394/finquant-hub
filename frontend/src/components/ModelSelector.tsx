/* ============================================================
 * ModelSelector — 全局模型切换下拉
 * ============================================================ */
import { Select } from 'antd';
import { useModelStore } from '../store/modelStore';
import { useLanguage } from '../i18n/LanguageContext';

export default function ModelSelector() {
  const { t } = useLanguage();
  const models = useModelStore((s) => s.models);
  const currentModelId = useModelStore((s) => s.currentModelId);
  const setCurrentModelId = useModelStore((s) => s.setCurrentModelId);
  const researchMode = useModelStore((s) => s.researchMode);
  const setResearchMode = useModelStore((s) => s.setResearchMode);
  const current = models.find((model) => model.id === currentModelId);

  return (
    <div className="model-selector">
      <Select
        aria-label={t('model.label')}
        value={researchMode}
        onChange={setResearchMode}
        placement="topLeft"
        options={[
          { label: t('model.fast'), value: 'fast' },
          { label: t('model.analyst'), value: 'analyst' },
          { label: t('model.deep'), value: 'deep' },
        ]}
      />
      <details className="model-selector__advanced">
        <summary>{t('model.advanced')}</summary>
        <Select
          aria-label={t('model.advanced')}
          value={currentModelId}
          onChange={setCurrentModelId}
          placeholder={t('model.unconfigured')}
          disabled={models.length === 0}
          placement="topLeft"
          options={models.map((model) => ({ label: model.name, value: model.id, title: `${model.provider} · ${model.model_name}` }))}
        />
        <span className="model-selector__meta" title={current ? `${current.provider} · ${current.model_name}` : t('model.manage')}>
          {current ? `${current.provider} · ${current.model_name}` : t('model.manage')}
        </span>
      </details>
    </div>
  );
}
