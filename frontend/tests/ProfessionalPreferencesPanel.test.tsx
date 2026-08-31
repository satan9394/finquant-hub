// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfessionalPreferencesPanel from '../src/components/settings/ProfessionalPreferencesPanel';
import { LanguageProvider } from '../src/i18n/LanguageContext';

const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), reset: vi.fn() }));
vi.mock('../src/features/professionalPreferences', () => ({
  readProfessionalPreferences: mocks.read,
  saveProfessionalPreferences: mocks.save,
  resetProfessionalPreferences: mocks.reset,
}));

const defaults = { version: 1, indicatorKeys: ['ma', 'macd', 'kdj', 'rsi'], layoutDensity: 'comfortable', alphaTemplateId: null };

describe('ProfessionalPreferencesPanel', () => {
  beforeEach(() => {
    localStorage.setItem('finquant_lang', 'zh');
    mocks.read.mockReset().mockReturnValue(defaults);
    mocks.save.mockReset().mockImplementation((value) => ({ version: 1, ...value }));
    mocks.reset.mockReset().mockReturnValue(defaults);
  });

  it('saves user-edited indicators and density through the preference callback', () => {
    render(<LanguageProvider><ProfessionalPreferencesPanel /></LanguageProvider>);

    fireEvent.click(screen.getByRole('checkbox', { name: 'KDJ' }));
    fireEvent.click(screen.getByRole('radio', { name: '紧凑' }));
    fireEvent.click(screen.getByRole('button', { name: '保存专业偏好' }));

    expect(mocks.save).toHaveBeenCalledWith({
      indicatorKeys: ['ma', 'macd', 'rsi'], layoutDensity: 'compact', alphaTemplateId: null,
    });
  });

  it('restores default preferences through the reset callback', () => {
    render(<LanguageProvider><ProfessionalPreferencesPanel /></LanguageProvider>);

    fireEvent.click(screen.getByRole('radio', { name: '紧凑' }));
    fireEvent.click(screen.getByRole('button', { name: '恢复默认' }));

    expect(mocks.reset).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('radio', { name: '舒适（默认）' }) as HTMLInputElement).checked).toBe(true);
  });
});
