// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import Models from '../src/pages/Models';
import { LanguageProvider } from '../src/i18n/LanguageContext';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }));
vi.mock('../src/services/api', () => ({ default: api }));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('finquant_lang', 'zh');
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: { items: [] } });
});

it('fetches models with an unsaved direct key and keeps manual entry available on failure', async () => {
  api.post.mockResolvedValue({ data: { ok: false, items: [], message: '供应商不支持，请手动填写模型名。' } });
  render(<LanguageProvider><Models /></LanguageProvider>);
  fireEvent.click(await screen.findByRole('button', { name: /新增模型/ }));
  fireEvent.change(screen.getByPlaceholderText('https://api.openai.com/v1'), { target: { value: 'https://model.test/v1' } });
  const password = document.querySelector('input[type="password"]')!;
  fireEvent.change(password, { target: { value: 'test-key' } });
  fireEvent.click(screen.getByRole('button', { name: '拉取模型列表' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/models/discover', expect.objectContaining({ base_url: 'https://model.test/v1', api_key: 'test-key' })));
  expect(await screen.findByText('供应商不支持，请手动填写模型名。')).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox', { name: '模型名' }), { target: { value: 'manual-model' } });
  expect(screen.getByDisplayValue('manual-model')).toBeTruthy();
});

it('auto-fills base_url when picking a preset and keeps manual entry for custom', async () => {
  render(<LanguageProvider><Models /></LanguageProvider>);
  fireEvent.click(await screen.findByRole('button', { name: /新增模型/ }));

  fireEvent.click(screen.getByRole('button', { name: 'DeepSeek（OpenAI 兼容）' }));
  expect(screen.getByDisplayValue('https://api.deepseek.com')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: '通义千问（阿里云百炼 · OpenAI 兼容）' }));
  expect(screen.getByDisplayValue('https://dashscope.aliyuncs.com/compatible-mode/v1')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: '硅基流动 SiliconFlow（OpenAI 兼容）' }));
  expect(screen.getByDisplayValue('https://api.siliconflow.cn/v1')).toBeTruthy();

  fireEvent.change(screen.getByPlaceholderText('https://api.openai.com/v1'), { target: { value: 'https://model.test/v1' } });
  fireEvent.click(screen.getByRole('button', { name: '其他 OpenAI 兼容接口' }));
  expect(screen.getByDisplayValue('https://model.test/v1')).toBeTruthy();
});
