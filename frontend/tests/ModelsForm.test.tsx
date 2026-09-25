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
  expect(screen.getByText(/若此供应商未开放 \/models 模型列表接口/)).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox', { name: '模型名' }), { target: { value: 'manual-model' } });
  expect(screen.getByDisplayValue('manual-model')).toBeTruthy();
});

it('shows searchable discovered models, fills both names on tag selection, and opens autocomplete suggestions on focus', async () => {
  api.post.mockResolvedValue({ data: {
    ok: true,
    items: ['deepseek-v4.1-flash', 'deepseek-chat', 'claude-sonnet'],
    message: '已拉取模型列表',
  } });
  render(<LanguageProvider><Models /></LanguageProvider>);
  fireEvent.click(await screen.findByRole('button', { name: /新增模型/ }));
  fireEvent.change(screen.getByPlaceholderText('https://api.openai.com/v1'), { target: { value: 'https://model.test/v1' } });
  fireEvent.change(document.querySelector('input[type="password"]')!, { target: { value: 'test-key' } });
  fireEvent.click(screen.getByRole('button', { name: '拉取模型列表' }));

  expect(await screen.findByTestId('discovered-model-selector')).toBeTruthy();
  expect(screen.getByText('已获取候选模型（3 个）')).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox', { name: '搜索已获取模型' }), { target: { value: 'flash' } });
  expect(screen.getByRole('button', { name: '选择模型 deepseek-v4.1-flash' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: '选择模型 deepseek-chat' })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: '选择模型 deepseek-v4.1-flash' }));
  expect(screen.getAllByDisplayValue('deepseek-v4.1-flash')).toHaveLength(2);
  await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('models-save-button')));

  fireEvent.focus(screen.getByRole('combobox', { name: '模型名' }));
  expect(await screen.findByRole('option', { name: 'deepseek-v4.1-flash' })).toBeTruthy();
});

it('batch-adds selected models with the current provider URL and credentials', async () => {
  api.post.mockImplementation((path: string) => (
    path === '/models/discover'
      ? Promise.resolve({ data: { ok: true, items: ['model-a', 'model-b'], message: '已拉取模型列表' } })
      : Promise.resolve({ data: {} })
  ));
  render(<LanguageProvider><Models /></LanguageProvider>);
  fireEvent.click(await screen.findByRole('button', { name: /新增模型/ }));
  fireEvent.change(screen.getByPlaceholderText('https://api.openai.com/v1'), { target: { value: 'https://model.test/v1' } });
  fireEvent.change(document.querySelector('input[type="password"]')!, { target: { value: 'batch-key' } });
  fireEvent.click(screen.getByRole('button', { name: '拉取模型列表' }));
  await screen.findByTestId('discovered-model-selector');

  fireEvent.click(screen.getByRole('checkbox', { name: '将 model-a 加入批量选择' }));
  fireEvent.click(screen.getByRole('checkbox', { name: '将 model-b 加入批量选择' }));
  fireEvent.click(screen.getByRole('button', { name: '批量添加已选（2）' }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/models', expect.objectContaining({
    name: 'model-a', model_name: 'model-a', base_url: 'https://model.test/v1', api_key: 'batch-key',
  })));
  expect(api.post).toHaveBeenCalledWith('/models', expect.objectContaining({
    name: 'model-b', model_name: 'model-b', base_url: 'https://model.test/v1', api_key: 'batch-key',
  }));
  expect(await screen.findByText('已批量添加 2 个模型配置。')).toBeTruthy();
});

it('auto-fills base_url when picking a preset and keeps manual entry for custom', async () => {
  render(<LanguageProvider><Models /></LanguageProvider>);
  fireEvent.click(await screen.findByRole('button', { name: /新增模型/ }));
  fireEvent.click(screen.getByRole('button', { name: '从常见厂商快速填入（可选）' }));

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
