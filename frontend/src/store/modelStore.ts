/* ============================================================
 * modelStore — 全局模型状态（含模型选择）
 * ============================================================ */
import { create } from 'zustand';
import type { ModelConfig } from '../types';

interface ModelStore {
  models: ModelConfig[];
  currentModelId: number | null;
  setModels: (models: ModelConfig[]) => void;
  setCurrentModelId: (id: number | null) => void;
  /** 根据 currentModelId 取当前模型 */
  currentModel: () => ModelConfig | undefined;
}

export const useModelStore = create<ModelStore>((set, get) => ({
  models: [],
  currentModelId: null,

  setModels: (models) => {
    const defaultModel = models.find((m) => m.is_default);
    set({
      models,
      currentModelId: get().currentModelId ?? defaultModel?.id ?? models[0]?.id ?? null,
    });
  },

  setCurrentModelId: (id) => set({ currentModelId: id }),

  currentModel: () => {
    const { models, currentModelId } = get();
    return models.find((m) => m.id === currentModelId);
  },
}));
