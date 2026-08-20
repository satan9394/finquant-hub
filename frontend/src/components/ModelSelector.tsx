/* ============================================================
 * ModelSelector — 全局模型切换下拉
 * ============================================================ */
import { Select } from 'antd';
import { useModelStore } from '../store/modelStore';

export default function ModelSelector() {
  const models = useModelStore((s) => s.models);
  const currentModelId = useModelStore((s) => s.currentModelId);
  const setCurrentModelId = useModelStore((s) => s.setCurrentModelId);
  const current = models.find((model) => model.id === currentModelId);

  return (
    <div className="model-selector">
      <Select
        aria-label="当前 AI 模型"
        value={currentModelId}
        onChange={setCurrentModelId}
        placeholder="尚未配置模型"
        disabled={models.length === 0}
        placement="topLeft"
        options={models.map((model) => ({
          label: model.name,
          value: model.id,
          title: `${model.provider} · ${model.model_name}`,
        }))}
      />
      <span className="model-selector__meta" title={current ? `${current.provider} · ${current.model_name}` : '前往模型管理添加配置'}>
        {current ? `${current.provider} · ${current.model_name}` : '前往模型管理添加配置'}
      </span>
    </div>
  );
}
