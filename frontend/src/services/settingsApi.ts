import apiClient from './api';

export interface SystemSettings {
  scheduler_enabled: boolean;
  scheduler_concurrency: number;
  scheduler_max_targets: number;
  scheduler_hour: number;
  scheduler_minute: number;
}

export interface SystemSettingsResponse {
  settings: SystemSettings;
  metadata: {
    app_version: string;
    editable_keys: Array<keyof SystemSettings>;
    secrets_exposed: false;
  };
}

export async function getSystemSettings(): Promise<SystemSettingsResponse> {
  const response = await apiClient.get('/settings/system');
  return response.data;
}

export async function updateSystemSettings(
  settings: SystemSettings,
): Promise<SystemSettingsResponse> {
  const response = await apiClient.patch('/settings/system', settings);
  return response.data;
}
