// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

import {
  filterProviders,
  forgetProviderHealth,
  formatCheckedAt,
  healthStatusOf,
  isProviderEnabled,
  readDisabledProviderIds,
  readProviderHealth,
  recordProviderHealth,
  setProviderEnabled,
  visibleProviders,
} from '../src/components/models/providerState';

const okEntry = {
  status: 'ok' as const,
  checkedAt: '2026-09-13T08:30:00.000Z',
  message: '连通成功',
  latencyMs: 210,
};

describe('providerState', () => {
  beforeEach(() => localStorage.clear());

  it('reports the three health states honestly', () => {
    expect(healthStatusOf(undefined)).toBe('untested');
    expect(healthStatusOf(okEntry)).toBe('ok');
    expect(healthStatusOf({ ...okEntry, status: 'error', message: '连接被拒绝' })).toBe('error');
  });

  it('persists and forgets a check result per provider', () => {
    expect(readProviderHealth()).toEqual({});
    const afterRecord = recordProviderHealth(7, okEntry);
    expect(afterRecord['7'].message).toBe('连通成功');
    expect(readProviderHealth()['7'].latencyMs).toBe(210);
    expect(forgetProviderHealth(7)).toEqual({});
    expect(readProviderHealth()).toEqual({});
  });

  it('keeps the disabled list stable and sorted', () => {
    expect(readDisabledProviderIds()).toEqual([]);
    setProviderEnabled(3, false);
    setProviderEnabled(1, false);
    expect(readDisabledProviderIds()).toEqual([1, 3]);
    setProviderEnabled(3, true);
    expect(readDisabledProviderIds()).toEqual([1]);
  });

  it('degrades to defaults when the stored payload is corrupt', () => {
    localStorage.setItem('finquant_provider_health', '{not json');
    localStorage.setItem('finquant_provider_disabled', 'null');
    expect(readProviderHealth()).toEqual({});
    expect(readDisabledProviderIds()).toEqual([]);
  });

  it('hides disabled providers unless they are explicitly shown', () => {
    const models = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(visibleProviders(models, [2], false).map((model) => model.id)).toEqual([1, 3]);
    expect(visibleProviders(models, [2], true)).toHaveLength(3);
    expect(isProviderEnabled(2, [2])).toBe(false);
    expect(isProviderEnabled(1, [2])).toBe(true);
  });

  it('filters the provider list by name, provider id and base URL', () => {
    const models = [
      { name: 'DeepSeek V4 Flash', provider: 'deepseek', base_url: 'https://api.deepseek.com' },
      { name: 'Kimi K2', provider: 'kimi', base_url: 'https://api.moonshot.cn/v1' },
    ];
    expect(filterProviders(models, '')).toHaveLength(2);
    expect(filterProviders(models, 'kimi').map((model) => model.provider)).toEqual(['kimi']);
    expect(filterProviders(models, 'moonshot').map((model) => model.provider)).toEqual(['kimi']);
    expect(filterProviders(models, '  flash ').map((model) => model.provider)).toEqual(['deepseek']);
    expect(filterProviders(models, 'no-such-provider')).toEqual([]);
  });

  it('formats the last check time and tolerates missing data', () => {
    expect(formatCheckedAt(undefined, 'zh')).toBe('');
    expect(formatCheckedAt('not-a-date', 'zh')).toBe('');
    expect(formatCheckedAt('2026-09-13T08:30:00.000Z', 'zh')).not.toBe('');
    expect(formatCheckedAt('2026-09-13T08:30:00.000Z', 'en')).not.toBe('');
  });
});
