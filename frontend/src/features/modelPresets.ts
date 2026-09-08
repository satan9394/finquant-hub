/* Model provider preset templates (CC Switch style).
 *
 * Pure data module: the provider Select options and the base_url auto-fill
 * presets on the Models page come from here. Every base_url is verified
 * against official documentation / known-correct values (see BACKLOG-041
 * evidence); do not add an entry whose base_url is not verified.
 */

export interface ModelPreset {
  /** Stable provider id, also the Select option value. */
  id: string;
  /** i18n label key (must exist in both zh.ts and en.ts). */
  labelKey: string;
  /** Verified OpenAI-compatible base URL. */
  baseUrl: string;
  /** Optional i18n remark key (not shown yet; reserved for future UI). */
  remarkKey?: string;
}

export const MODEL_PRESETS: ModelPreset[] = [
  // International (kept from the original inline presets)
  { id: 'openai', labelKey: 'models.provider.openai', baseUrl: 'https://api.openai.com/v1' },
  { id: 'deepseek', labelKey: 'models.provider.deepseek', baseUrl: 'https://api.deepseek.com' },
  { id: 'openrouter', labelKey: 'models.provider.openrouter', baseUrl: 'https://openrouter.ai/api/v1' },
  // Domestic (verified base URLs — see BACKLOG-041 evidence)
  { id: 'dashscope', labelKey: 'models.provider.dashscope', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { id: 'glm', labelKey: 'models.provider.glm', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { id: 'kimi', labelKey: 'models.provider.kimi', baseUrl: 'https://api.moonshot.cn/v1' },
  { id: 'doubao', labelKey: 'models.provider.doubao', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' },
  { id: 'siliconflow', labelKey: 'models.provider.siliconflow', baseUrl: 'https://api.siliconflow.cn/v1' },
];

/** Look up a preset's verified base URL; undefined when id is unknown (e.g. custom). */
export function presetBaseUrl(id: string): string | undefined {
  return MODEL_PRESETS.find((preset) => preset.id === id)?.baseUrl;
}
