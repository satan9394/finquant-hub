import { describe, expect, it } from 'vitest';

import { MODEL_PRESETS, presetBaseUrl } from '../src/features/modelPresets';
import { translations } from '../src/i18n';

describe('MODEL_PRESETS', () => {
  it('keeps the original three international presets with their base URLs', () => {
    const ids = MODEL_PRESETS.map((preset) => preset.id);
    expect(ids).toContain('openai');
    expect(ids).toContain('deepseek');
    expect(ids).toContain('openrouter');
    expect(presetBaseUrl('openai')).toBe('https://api.openai.com/v1');
    expect(presetBaseUrl('deepseek')).toBe('https://api.deepseek.com');
    expect(presetBaseUrl('openrouter')).toBe('https://openrouter.ai/api/v1');
  });

  it('adds at least five domestic provider presets', () => {
    const domestic = ['dashscope', 'glm', 'kimi', 'doubao', 'siliconflow'];
    for (const id of domestic) {
      expect(presetBaseUrl(id), `missing domestic preset ${id}`).toBeTruthy();
    }
    expect(MODEL_PRESETS.length).toBeGreaterThanOrEqual(3 + domestic.length);
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
  });
});
