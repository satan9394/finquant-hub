// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import Models from '../src/pages/Models';
import { LanguageProvider } from '../src/i18n/LanguageContext';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('../src/services/api', () => ({ default: api }));

beforeEach(() => {
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

it('auto-fills base_url when switching to a preset provider and keeps manual entry for custom', async () => {
  render(<LanguageProvider><Models /></LanguageProvider>);
  fireEvent.click(await screen.findByRole('button', { name: /新增模型/ }));

  const provider = () => screen.getByRole('combobox', { name: '供应商' });
  const pick = async (label: string) => {
    fireEvent.mouseDown(provider());
    fireEvent.click(await screen.findByText(label, undefined, { timeout: 2000 }));
  };

  await pick('DeepSeek（OpenAI 兼容）');
  expect(screen.getByDisplayValue('https://api.deepseek.com')).toBeTruthy();

  await pick('通义千问（阿里云百炼 · OpenAI 兼容）');
  expect(screen.getByDisplayValue('https://dashscope.aliyuncs.com/compatible-mode/v1')).toBeTruthy();

  await pick('硅基流动 SiliconFlow（OpenAI 兼容）');
  expect(screen.getByDisplayValue('https://api.siliconflow.cn/v1')).toBeTruthy();

  fireEvent.change(screen.getByPlaceholderText('https://api.openai.com/v1'), { target: { value: 'https://model.test/v1' } });
  await pick('其他 OpenAI 兼容接口');
  expect(screen.getByDisplayValue('https://model.test/v1')).toBeTruthy();
});
