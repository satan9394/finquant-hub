import { INDICATOR_KEYS, type IndicatorKey } from './indicatorKnowledge';

export const PROFESSIONAL_PREFERENCES_KEY = 'finquant_professional_preferences_v1';
export const PROFESSIONAL_PREFERENCES_EVENT = 'finquant:professional-preferences';

export type LayoutDensity = 'comfortable' | 'compact';

export interface ProfessionalPreferences {
  version: 1;
  indicatorKeys: IndicatorKey[];
  layoutDensity: LayoutDensity;
  alphaTemplateId: string | null;
}

export const DEFAULT_PROFESSIONAL_PREFERENCES: ProfessionalPreferences = {
  version: 1,
  indicatorKeys: [...INDICATOR_KEYS],
  layoutDensity: 'comfortable',
  alphaTemplateId: null,
};

function defaults(): ProfessionalPreferences {
  return { ...DEFAULT_PROFESSIONAL_PREFERENCES, indicatorKeys: [...INDICATOR_KEYS] };
}

function normalize(value: unknown): ProfessionalPreferences {
  if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== 1) return defaults();
  const candidate = value as Partial<ProfessionalPreferences>;
  const indicatorKeys = Array.isArray(candidate.indicatorKeys)
    ? INDICATOR_KEYS.filter((key) => candidate.indicatorKeys?.includes(key))
    : [];
  const alphaTemplateId = typeof candidate.alphaTemplateId === 'string'
    && /^[A-Za-z0-9._-]{1,100}$/.test(candidate.alphaTemplateId)
    ? candidate.alphaTemplateId
    : null;
  return {
    version: 1,
    indicatorKeys: indicatorKeys.length ? indicatorKeys : [...INDICATOR_KEYS],
    layoutDensity: candidate.layoutDensity === 'compact' ? 'compact' : 'comfortable',
    alphaTemplateId,
  };
}

export function readProfessionalPreferences(): ProfessionalPreferences {
  try {
    return normalize(JSON.parse(localStorage.getItem(PROFESSIONAL_PREFERENCES_KEY) || 'null'));
  } catch {
    return defaults();
  }
}

function notifyPreferenceChange() {
  window.dispatchEvent(new Event(PROFESSIONAL_PREFERENCES_EVENT));
}

export function saveProfessionalPreferences(
  input: Omit<ProfessionalPreferences, 'version'>,
): ProfessionalPreferences {
  const value = normalize({ ...input, version: 1 });
  localStorage.setItem(PROFESSIONAL_PREFERENCES_KEY, JSON.stringify(value));
  notifyPreferenceChange();
  return value;
}

export function updateProfessionalPreferences(
  patch: Partial<Omit<ProfessionalPreferences, 'version'>>,
): ProfessionalPreferences {
  const current = readProfessionalPreferences();
  return saveProfessionalPreferences({
    indicatorKeys: patch.indicatorKeys ?? current.indicatorKeys,
    layoutDensity: patch.layoutDensity ?? current.layoutDensity,
    alphaTemplateId: patch.alphaTemplateId === undefined ? current.alphaTemplateId : patch.alphaTemplateId,
  });
}

export function resetProfessionalPreferences(): ProfessionalPreferences {
  localStorage.removeItem(PROFESSIONAL_PREFERENCES_KEY);
  notifyPreferenceChange();
  return defaults();
}
