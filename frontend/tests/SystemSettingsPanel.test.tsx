// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SystemSettingsPanel from '../src/components/settings/SystemSettingsPanel';
import { LanguageProvider } from '../src/i18n/LanguageContext';

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
vi.mock('../src/services/settingsApi', () => ({ getSystemSettings: mocks.get, updateSystemSettings: mocks.update }));

const settings = { scheduler_enabled: false, scheduler_hour: 18, scheduler_minute: 0, scheduler_concurrency: 2, scheduler_max_targets: 20 };
const response = { settings, metadata: { app_version: '1.2.3', editable_keys: Object.keys(settings), secrets_exposed: false } };

describe('SystemSettingsPanel', () => {
  beforeEach(() => {
    localStorage.setItem('finquant_lang', 'zh');
    mocks.get.mockReset().mockResolvedValue(response);
    mocks.update.mockReset().mockImplementation(async (value) => ({ ...response, settings: value }));
  });

  it('loads allowlisted scheduler settings and application version', async () => {
    render(<LanguageProvider><SystemSettingsPanel /></LanguageProvider>);

    expect(await screen.findByTestId('system-settings-panel')).toBeTruthy();
    expect(await screen.findByText('FinQuant Hub 1.2.3')).toBeTruthy();
    expect(screen.getByText(/API Key 和环境变量值不会返回浏览器/)).toBeTruthy();
  });

  it('saves an edited scheduler switch through the service callback', async () => {
    render(<LanguageProvider><SystemSettingsPanel /></LanguageProvider>);
    const toggle = await screen.findByRole('switch');

    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: /保存并应用/ }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ ...settings, scheduler_enabled: true }));
  });
});
