import { describe, expect, it } from 'vitest';

import {
  MODEL_PRESETS,
  PRESET_CATEGORIES,
  filterPresets,
  groupPresetsByCategory,
  presetBaseUrl,
  presetById,
} from '../src/features/modelPresets';
import { translations } from '../src/i18n';

const labelOf = (preset: { labelKey: string }) => translations.zh[preset.labelKey] ?? preset.labelKey;

describe('MODEL_PRESETS', () => {
  it('ships at least fifteen provider presets', () => {
    expect(MODEL_PRESETS.length).toBeGreaterThanOrEqual(15);
  });

  it('keeps the original international presets with their verified base URLs', () => {
    expect(presetBaseUrl('openai')).toBe('https://api.openai.com/v1');
    expect(presetBaseUrl('deepseek')).toBe('https://api.deepseek.com');
    expect(presetBaseUrl('openrouter')).toBe('https://openrouter.ai/api/v1');
  });

  it('includes the native Anthropic Messages preset with the documented default model', () => {
    const anthropic = presetById('anthropic');
    expect(anthropic).toMatchObject({
      baseUrl: 'https://api.anthropic.com',
      defaultModel: 'claude-3-7-sonnet',
      protocol: 'anthropic',
    });
    expect(anthropic?.docsUrl).toMatch(/^https:\/\/docs\.anthropic\.com\//);
    expect(translations.zh[anthropic!.labelKey]).toContain('Anthropic');
    expect(translations.en[anthropic!.labelKey]).toContain('Anthropic');
  });

  it('keeps the domestic presets with their verified base URLs', () => {
    const domestic = ['dashscope', 'glm', 'kimi', 'siliconflow', 'minimax', 'stepfun', 'hunyuan'];
    for (const id of domestic) {
      expect(presetBaseUrl(id), `missing domestic preset ${id}`).toBeTruthy();
      expect(presetById(id)?.category).toBe('domestic');
    }
    expect(presetBaseUrl('glm')).toBe('https://open.bigmodel.cn/api/paas/v4');
    expect(presetBaseUrl('kimi')).toBe('https://api.moonshot.cn/v1');
    expect(presetBaseUrl('siliconflow')).toBe('https://api.siliconflow.cn/v1');
  });

  it('covers both required categories', () => {
    for (const category of ['domestic', 'international'] as const) {
      const count = MODEL_PRESETS.filter((preset) => preset.category === category).length;
      expect(count, `category ${category} is empty`).toBeGreaterThanOrEqual(5);
    }
    for (const preset of MODEL_PRESETS) {
      expect(PRESET_CATEGORIES).toContain(preset.category);
    }
  });

  it('points every preset at an official https documentation page', () => {
    for (const preset of MODEL_PRESETS) {
      expect(preset.docsUrl, `missing docsUrl for ${preset.id}`).toMatch(/^https:\/\/.+/);
      expect(() => new URL(preset.docsUrl)).not.toThrow();
    }
  });

  it('has structurally complete entries with valid http(s) base URLs', () => {
    for (const preset of MODEL_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.labelKey).toBeTruthy();
      expect(preset.baseUrl).toMatch(/^https?:\/\/.+/);
      expect(() => new URL(preset.baseUrl)).not.toThrow();
    }
  });

  it('keeps ids unique', () => {
    const ids = MODEL_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resolves every labelKey in both zh and en (parity 0)', () => {
    for (const preset of MODEL_PRESETS) {
      expect(translations.zh[preset.labelKey], `zh missing ${preset.labelKey}`).toBeTruthy();
      expect(translations.en[preset.labelKey], `en missing ${preset.labelKey}`).toBeTruthy();
    }
  });

  it('returns undefined for an unknown preset id (custom keeps manual entry)', () => {
    expect(presetBaseUrl('custom')).toBeUndefined();
    expect(presetBaseUrl('unknown-vendor')).toBeUndefined();
    expect(presetById('custom')).toBeUndefined();
    expect(presetById(undefined)).toBeUndefined();
  });

  it('groups presets by category without dropping any entry', () => {
    const groups = groupPresetsByCategory();
    const grouped = groups.flatMap((group) => group.presets);
    expect(grouped).toHaveLength(MODEL_PRESETS.length);
    expect(groups.every((group) => group.presets.length > 0)).toBe(true);
    expect(groups.map((group) => group.category)).toEqual(
      PRESET_CATEGORIES.filter((category) => MODEL_PRESETS.some((preset) => preset.category === category)),
    );
  });

  it('filters presets by translated label, id and base URL', () => {
    expect(filterPresets('siliconflow', labelOf).map((preset) => preset.id)).toEqual(['siliconflow']);
    expect(filterPresets('硅基流动', labelOf).map((preset) => preset.id)).toEqual(['siliconflow']);
    expect(filterPresets('api.moonshot.cn', labelOf).map((preset) => preset.id)).toEqual(['kimi']);
    expect(filterPresets('   ', labelOf)).toHaveLength(MODEL_PRESETS.length);
    expect(filterPresets('no-such-provider', labelOf)).toEqual([]);
  });
});
