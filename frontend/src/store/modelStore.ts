/* ============================================================
 * modelStore — 全局模型状态（含模型选择）
 * ============================================================ */
import { create } from 'zustand';
import type { ModelConfig } from '../types';

interface ModelStore {
  models: ModelConfig[];
  currentModelId: number | null;
  researchMode: 'fast' | 'analyst' | 'deep';
  setModels: (models: ModelConfig[]) => void;
  setCurrentModelId: (id: number | null) => void;
  setResearchMode: (mode: 'fast' | 'analyst' | 'deep') => void;
  /** 根据 currentModelId 取当前模型 */
  currentModel: () => ModelConfig | undefined;
}

export const useModelStore = create<ModelStore>((set, get) => ({
  models: [],
  currentModelId: null,
  researchMode: (typeof localStorage === 'undefined' ? null : localStorage.getItem('finquant_research_mode') as 'fast' | 'analyst' | 'deep' | null) ?? 'fast',

  setModels: (models) => {
    const defaultModel = models.find((m) => m.is_default);
    set({
      models,
      currentModelId: get().currentModelId ?? defaultModel?.id ?? models[0]?.id ?? null,
    });
  },

  setCurrentModelId: (id) => set({ currentModelId: id }),

  setResearchMode: (researchMode) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('finquant_research_mode', researchMode);
    set({ researchMode });
  },

  currentModel: () => {
    const { models, currentModelId } = get();
    return models.find((m) => m.id === currentModelId);
  },
}));
