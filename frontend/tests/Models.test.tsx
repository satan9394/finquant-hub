// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { modelCredentialLabel } from '../src/pages/Models';
import type { ModelConfig } from '../src/types';

const model: ModelConfig = {
  id: 1,
  name: 'Local model',
  provider: 'openai',
  base_url: 'https://api.example.com',
  model_name: 'example',
  api_key_env: 'MODEL_API_KEY',
  has_api_key: false,
  credential_source: 'none',
  temperature: 0.7,
  max_tokens: 4096,
  is_default: 1,
  created_at: '2026-08-13',
  updated_at: '2026-08-13',
};

describe('modelCredentialLabel', () => {
  it('distinguishes a declared environment name from a loaded credential', () => {
    expect(modelCredentialLabel(model)).toBe('等待环境变量：MODEL_API_KEY');
    expect(modelCredentialLabel({ ...model, has_api_key: true, credential_source: 'environment' }))
      .toBe('环境变量已载入：MODEL_API_KEY');
    expect(modelCredentialLabel({ ...model, has_api_key: true, credential_source: 'stored' }))
      .toBe('已安全保存');
  });
});
