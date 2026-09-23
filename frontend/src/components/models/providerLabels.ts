/* Credential vocabulary for a model config row.
 *
 * Lives outside pages/Models.tsx so the provider card can reuse it without a
 * circular import; Models.tsx re-exports it for the existing test surface.
 */
import { translations, translate } from '../../i18n';
import type { ModelConfig } from '../../types';

export type Translator = (key: string, values?: Record<string, string | number>) => string;

export function modelCredentialLabel(
  model: ModelConfig,
  t: Translator = (key, values) => translate('zh', key, values),
) {
  if (model.credential_source === 'stored') return t('models.credentials.stored');
  if (model.credential_source === 'environment') {
    return t('models.credentials.environment', { variable: model.api_key_env || '' });
  }
  if (model.api_key_env) return t('models.credentials.waiting', { variable: model.api_key_env });
  return t('models.credentials.missing');
}

/**
 * Provider type label for the card. Uses the translated preset label when one
 * exists, otherwise the raw provider id (e.g. a config saved before a preset was
 * removed), so nothing is silently relabelled as "custom".
 */
export function providerTypeLabel(provider: string, t: Translator): string {
  const key = `models.provider.${provider}`;
  if (translations.zh[key] || translations.en[key]) return t(key);
  return provider || t('models.provider.custom');
}
