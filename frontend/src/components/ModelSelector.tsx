/* ============================================================
 * ModelSelector — 全局模型切换下拉
 * ============================================================ */
import { Select } from 'antd';
import { useModelStore } from '../store/modelStore';

export default function ModelSelector() {
  const models = useModelStore((s) => s.models);
  const currentModelId = useModelStore((s) => s.currentModelId);
  const setCurrentModelId = useModelStore((s) => s.setCurrentModelId);

  return (
    <Select
      value={currentModelId}
      onChange={setCurrentModelId}
      placeholder="选择模型"
      style={{ width: 200 }}
      options={models.map((m) => ({
        label: `${m.name} (${m.model_name})`,
        value: m.id,
      }))}
    />
  );
}
