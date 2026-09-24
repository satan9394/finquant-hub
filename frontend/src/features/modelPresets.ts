/* Model provider preset library (CC Switch style).
 *
 * Pure data module: the grouped preset selector and the base_url auto-fill on
 * the Models page read from here.
 *
 * DISCIPLINE (BACKLOG-043): every `baseUrl` MUST be directly evidenced by the
 * vendor's own documentation — the `docsUrl` field points at that page and the
 * evidence table in docs/ai/tasks/BACKLOG-043.md quotes the exact line. An
 * entry whose base URL cannot be proven from an official source is NOT added;
 * unproven candidates are listed in the evidence file instead.
 */

/** Preset grouping shown by the selector. */
export type PresetCategory = 'international' | 'domestic' | 'local';

/** Display order of the groups in the preset selector. */
export const PRESET_CATEGORIES: PresetCategory[] = ['domestic', 'international', 'local'];

export interface ModelPreset {
  /** Stable provider id, also the Select/button value. */
  id: string;
  /** i18n label key (must exist in both zh.ts and en.ts). */
  labelKey: string;
  /** base URL verified against `docsUrl`. */
  baseUrl: string;
  /** Grouping for the preset selector. */
  category: PresetCategory;
  /** Official documentation page that states this base URL. */
  docsUrl: string;
  /** Optional i18n remark key. */
  remarkKey?: string;
  /** Wire protocol selected by the backend LLMClient. */
  protocol?: 'openai-compatible' | 'anthropic';
  /** Optional model filled when selecting this preset. */
  defaultModel?: string;
}

export const MODEL_PRESETS: ModelPreset[] = [
  // ---- Domestic (official docs evidence in BACKLOG-043) ----
  {
    id: 'dashscope',
    labelKey: 'models.provider.dashscope',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    category: 'domestic',
    docsUrl: 'https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope',
  },
  {
    id: 'glm',
    labelKey: 'models.provider.glm',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    category: 'domestic',
    docsUrl: 'https://docs.bigmodel.cn/cn/guide/develop/openai/introduction',
  },
  {
    id: 'kimi',
    labelKey: 'models.provider.kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    category: 'domestic',
    docsUrl: 'https://platform.kimi.com/docs/api/overview',
  },
  {
    id: 'minimax',
    labelKey: 'models.provider.minimax',
    baseUrl: 'https://api.minimax.cn/v1',
    category: 'domestic',
    docsUrl: 'https://platform.minimaxi.com/docs/api-reference/text-openai-api',
  },
  {
    id: 'hunyuan',
    labelKey: 'models.provider.hunyuan',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    category: 'domestic',
    docsUrl: 'https://cloud.tencent.com/document/product/1729/111007',
  },
  {
    id: 'siliconflow',
    labelKey: 'models.provider.siliconflow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    category: 'domestic',
    docsUrl: 'https://docs.siliconflow.cn/docs/userguide/quickstart',
  },
  {
    id: 'stepfun',
    labelKey: 'models.provider.stepfun',
    baseUrl: 'https://api.stepfun.com/v1',
    category: 'domestic',
    docsUrl: 'https://platform.stepfun.com/docs/zh/api-reference/chat/chat-completion-create',
  },
  // ---- International ----
  {
    id: 'anthropic',
    labelKey: 'models.provider.anthropic',
    baseUrl: 'https://api.anthropic.com',
    category: 'international',
    docsUrl: 'https://docs.anthropic.com/en/api/getting-started',
    protocol: 'anthropic',
    defaultModel: 'claude-3-7-sonnet',
  },
  {
    id: 'openai',
    labelKey: 'models.provider.openai',
    baseUrl: 'https://api.openai.com/v1',
    category: 'international',
    docsUrl: 'https://platform.openai.com/docs/api-reference',
    protocol: 'openai-compatible',
  },
  {
    id: 'deepseek',
    labelKey: 'models.provider.deepseek',
    baseUrl: 'https://api.deepseek.com',
    category: 'international',
    docsUrl: 'https://api-docs.deepseek.com/',
  },
  {
    id: 'openrouter',
    labelKey: 'models.provider.openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    category: 'international',
    docsUrl: 'https://openrouter.ai/docs/quickstart',
  },
  {
    id: 'together',
    labelKey: 'models.provider.together',
    baseUrl: 'https://api.together.ai/v1',
    category: 'international',
    docsUrl: 'https://docs.together.ai/docs/quickstart',
  },
  {
    id: 'fireworks',
    labelKey: 'models.provider.fireworks',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    category: 'international',
    docsUrl: 'https://docs.fireworks.ai/getting-started/quickstart',
  },
  {
    id: 'cerebras',
    labelKey: 'models.provider.cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    category: 'international',
    docsUrl: 'https://inference-docs.cerebras.ai/quickstart',
  },
  {
    id: 'deepinfra',
    labelKey: 'models.provider.deepinfra',
    baseUrl: 'https://api.deepinfra.com/v1/openai',
    category: 'international',
    docsUrl: 'https://docs.deepinfra.com/quickstart',
  },
  {
    id: 'nebius',
    labelKey: 'models.provider.nebius',
    baseUrl: 'https://api.tokenfactory.nebius.com/v1',
    category: 'international',
    docsUrl: 'https://docs.tokenfactory.nebius.com/quickstart',
  },
];

/** Look up a preset's verified base URL; undefined when id is unknown (e.g. custom). */
export function presetBaseUrl(id: string): string | undefined {
  return MODEL_PRESETS.find((preset) => preset.id === id)?.baseUrl;
}

/** Look up the whole preset; undefined for unknown ids such as `custom`. */
export function presetById(id: string | undefined | null): ModelPreset | undefined {
  if (!id) return undefined;
  return MODEL_PRESETS.find((preset) => preset.id === id);
}

export interface PresetGroup {
  category: PresetCategory;
  presets: ModelPreset[];
}

/** Group presets by category in PRESET_CATEGORIES order, dropping empty groups. */
export function groupPresetsByCategory(presets: ModelPreset[] = MODEL_PRESETS): PresetGroup[] {
  return PRESET_CATEGORIES
    .map((category) => ({ category, presets: presets.filter((preset) => preset.category === category) }))
    .filter((group) => group.presets.length > 0);
}

/**
 * Case-insensitive preset search over the translated label plus the raw id and
 * base URL, so both "硅基流动" and "siliconflow" match.
 */
export function filterPresets(
  query: string,
  labelOf: (preset: ModelPreset) => string,
  presets: ModelPreset[] = MODEL_PRESETS,
): ModelPreset[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return presets;
  return presets.filter((preset) =>
    [labelOf(preset), preset.id, preset.baseUrl].join(' ').toLowerCase().includes(keyword),
  );
}
