// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { message } from 'antd';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import Discussion from '../src/pages/Discussion';
import apiClient from '../src/services/api';
import { useDiscussionStore } from '../src/store/discussionStore';
import type { DiscussionRoom } from '../src/types';

vi.mock('../src/services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../src/components/DiscussionTimeline', () => ({ default: () => <div data-testid="discussion-timeline" /> }));
vi.mock('../src/components/InvestmentCommittee', () => ({ default: () => <div data-testid="investment-committee" /> }));

const room = {
  id: 42,
  conversation_id: 142,
  topic: '测试议题',
  participants: [{ role_key: 'risk_manager', name: '风险官', avatar: '盾' }],
  total_rounds: 3,
  current_phase: 'active',
  summary: null,
  created_at: '2026-08-20T00:00:00Z',
} as const;

describe('Discussion async room detail guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDiscussionStore.setState({
      rooms: [room],
      currentRoomId: room.id,
      messages: { [room.id]: [] },
      streamingContent: '',
      isStreaming: false,
    });
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === `/discussion/rooms/${room.id}`) return new Promise(() => {}) as never;
      if (url === '/discussion/rooms') return Promise.resolve({ data: { items: [room] } }) as never;
      if (url === '/agents') return Promise.resolve({ data: [] }) as never;
      return Promise.resolve({ data: {} }) as never;
    });
  });

  afterEach(() => {
    useDiscussionStore.setState({
      rooms: [], currentRoomId: null, messages: {}, streamingContent: '', isStreaming: false,
    });
  });

  it('shows a loading state when a room is selected before its detail arrives', () => {
    render(<MemoryRouter><Discussion /></MemoryRouter>);

    expect(screen.getByRole('status').textContent).toContain('正在加载讨论详情');
    expect(screen.queryByTestId('investment-committee')).toBeNull();
  });

  it('renders structured review output without the chat-style timeline', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === `/discussion/rooms/${room.id}`) return Promise.resolve({ data: { room, messages: [] } }) as never;
      if (url === '/discussion/rooms') return Promise.resolve({ data: { items: [room] } }) as never;
      if (url === '/agents') return Promise.resolve({ data: [] }) as never;
      return Promise.resolve({ data: {} }) as never;
    });
    render(<MemoryRouter><Discussion /></MemoryRouter>);
    expect(await screen.findByTestId('investment-committee')).toBeTruthy();
    expect(screen.queryByTestId('discussion-timeline')).toBeNull();
  });

  it('gives every creation control an explicit accessible name', async () => {
    useDiscussionStore.setState({ currentRoomId: null });
    render(<MemoryRouter><Discussion /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: '创建讨论' }));

    expect(await screen.findByRole('textbox', { name: '讨论主题' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: '参与角色（至少 3 个）' })).toBeTruthy();
    expect(screen.getByRole('spinbutton', { name: '讨论轮次' })).toBeTruthy();
  });
});

// ==================== VS16：?room=<id> 深链回归（首页"最近讨论"点击后打开那一条） ====================

describe('Discussion ?room= deep link (VS16 regression)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('finquant_lang', 'zh');
    useDiscussionStore.setState({ rooms: [], currentRoomId: null, messages: {}, streamingContent: '', isStreaming: false });
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/discussion/rooms') return Promise.resolve({ data: { items: [room] } }) as never;
      if (url === '/agents') return Promise.resolve({ data: { items: [] } }) as never;
      if (url === `/discussion/rooms/${room.id}`) return Promise.resolve({ data: { room, messages: [] } }) as never;
      return Promise.resolve({ data: {} }) as never;
    });
  });

  afterEach(() => {
    useDiscussionStore.setState({ rooms: [], currentRoomId: null, messages: {}, streamingContent: '', isStreaming: false });
  });

  it('opens the room named by ?room=<id> and loads its detail', async () => {
    render(<MemoryRouter initialEntries={['/research?mode=review&room=42']}><Discussion /></MemoryRouter>);

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/discussion/rooms/42'));
    expect(useDiscussionStore.getState().currentRoomId).toBe(42);
    expect(await screen.findByTestId('investment-committee')).toBeTruthy();
  });

  it('falls back without selecting or querying a missing room', async () => {
    render(<MemoryRouter initialEntries={['/research?mode=review&room=999']}><Discussion /></MemoryRouter>);

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/discussion/rooms'));
    await waitFor(() => expect(screen.getByText('请选择或创建一个讨论房间')).toBeTruthy());
    expect(apiClient.get).not.toHaveBeenCalledWith('/discussion/rooms/999');
    expect(useDiscussionStore.getState().currentRoomId).toBeNull();
  });

  // 修前：effect 依赖 rooms 且无"只应用一次"守卫 → addRoom 产生新数组 → 被 URL 里的旧 room 抢回焦点。
  it('does not snap back to the deep-linked room after the user picks another one', async () => {
    const otherRoom: DiscussionRoom = {
      id: 43, conversation_id: 143, topic: '后来手选的讨论',
      participants: [{ role_key: 'risk_manager', name: '风险官', avatar: '盾' }],
      total_rounds: 3, current_phase: 'active', summary: null, created_at: '2026-09-10T00:00:00Z',
    };
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/discussion/rooms') return Promise.resolve({ data: { items: [room, otherRoom] } }) as never;
      if (url === '/agents') return Promise.resolve({ data: { items: [] } }) as never;
      if (url === '/discussion/rooms/42') return Promise.resolve({ data: { room, messages: [] } }) as never;
      if (url === '/discussion/rooms/43') return Promise.resolve({ data: { room: otherRoom, messages: [] } }) as never;
      return Promise.resolve({ data: {} }) as never;
    });
    render(<MemoryRouter initialEntries={['/research?mode=review&room=42']}><Discussion /></MemoryRouter>);

    await waitFor(() => expect(useDiscussionStore.getState().currentRoomId).toBe(42));
    fireEvent.click(screen.getByText('后来手选的讨论'));
    await waitFor(() => expect(useDiscussionStore.getState().currentRoomId).toBe(43));

    // 模拟"新建讨论"：discussionStore.addRoom 会 set 出一个新数组 → 触发依赖 rooms 的 effect 重跑。
    act(() => {
      useDiscussionStore.getState().addRoom({ ...otherRoom, id: 44, conversation_id: 144, topic: '新建的讨论' });
    });

    expect(await screen.findByText('新建的讨论')).toBeTruthy();
    expect(useDiscussionStore.getState().currentRoomId).toBe(43);
  });

  it('still pre-fills the creation dialog from ?topic=', async () => {
    const agents = ['risk_manager', 'bull_analyst', 'bear_analyst'].map((role_key, index) => ({
      id: index + 1, name: role_key, role_key, avatar: 'AI',
      system_prompt: '', model_id: null, is_preset: 1, created_at: '2026-09-01T00:00:00Z',
    }));
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/discussion/rooms') return Promise.resolve({ data: { items: [] } }) as never;
      if (url === '/agents') return Promise.resolve({ data: { items: agents } }) as never;
      return Promise.resolve({ data: {} }) as never;
    });
    render(<MemoryRouter initialEntries={['/research?mode=review&topic=600519 的现金流']}><Discussion /></MemoryRouter>);

    const topicInput = await screen.findByRole('textbox', { name: '讨论主题' });
    expect((topicInput as HTMLTextAreaElement).value).toBe('600519 的现金流');
  });
});

// ==================== VS19：深链落空必须说出来，且只说一次 ====================
// 修前：?room=<不在列表> 不选中、不提示、不报错 → 用户看到空白默认视图，体感等同"点了没反应"。
describe('Discussion ?room= deep link fallback notice (VS19)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('finquant_lang', 'zh');
    useDiscussionStore.setState({ rooms: [], currentRoomId: null, messages: {}, streamingContent: '', isStreaming: false });
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/discussion/rooms') return Promise.resolve({ data: { items: [room] } }) as never;
      if (url === '/agents') return Promise.resolve({ data: { items: [] } }) as never;
      if (url === `/discussion/rooms/${room.id}`) return Promise.resolve({ data: { room, messages: [] } }) as never;
      return Promise.resolve({ data: {} }) as never;
    });
  });

  afterEach(() => {
    act(() => message.destroy());
    vi.restoreAllMocks();
    useDiscussionStore.setState({ rooms: [], currentRoomId: null, messages: {}, streamingContent: '', isStreaming: false });
  });

  it('warns exactly once for a room missing from the list, even after the list changes again', async () => {
    const warn = vi.spyOn(message, 'warning').mockImplementation(() => undefined as never);
    render(<MemoryRouter initialEntries={['/research?mode=review&room=999']}><Discussion /></MemoryRouter>);

    await waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(warn).toHaveBeenCalledWith('该讨论已不存在，已显示当前讨论列表');

    // 列表再变一次（刷新/新建讨论都会产生新数组）→ 不得二次提示。
    // 删掉一次性守卫后此断言会红（第二次提示），所以它真的在守"只提示一次"。
    act(() => { useDiscussionStore.getState().setRooms([...useDiscussionStore.getState().rooms]); });
    await waitFor(() => expect(useDiscussionStore.getState().rooms).toHaveLength(1));
    expect(warn).toHaveBeenCalledTimes(1);

    // VS16 语义不变：不抢焦点、不为非法 id 发请求。
    expect(useDiscussionStore.getState().currentRoomId).toBeNull();
    expect(apiClient.get).not.toHaveBeenCalledWith('/discussion/rooms/999');
    expect(screen.getByText('请选择或创建一个讨论房间')).toBeTruthy();
  });

  it('never warns about a deep link that resolves to an existing room', async () => {
    const warn = vi.spyOn(message, 'warning').mockImplementation(() => undefined as never);
    render(<MemoryRouter initialEntries={['/research?mode=review&room=42']}><Discussion /></MemoryRouter>);

    await waitFor(() => expect(useDiscussionStore.getState().currentRoomId).toBe(42));
    expect(await screen.findByTestId('investment-committee')).toBeTruthy();

    act(() => { useDiscussionStore.getState().setRooms([...useDiscussionStore.getState().rooms]); });

    expect(warn).not.toHaveBeenCalled();
    expect(useDiscussionStore.getState().currentRoomId).toBe(42);
  });

  it('reports a list read failure instead of claiming the room does not exist', async () => {
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === '/discussion/rooms') return Promise.reject(new Error('network down')) as never;
      if (url === '/agents') return Promise.resolve({ data: { items: [] } }) as never;
      return Promise.resolve({ data: {} }) as never;
    });
    const warn = vi.spyOn(message, 'warning').mockImplementation(() => undefined as never);
    render(<MemoryRouter initialEntries={['/research?mode=review&room=42']}><Discussion /></MemoryRouter>);

    await waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    // 系统故障不得被说成"数据不存在"（错误归因）。
    expect(warn).toHaveBeenCalledWith('讨论列表读取失败，未能打开指定讨论');
    expect(warn).not.toHaveBeenCalledWith('该讨论已不存在，已显示当前讨论列表');
    expect(apiClient.get).not.toHaveBeenCalledWith('/discussion/rooms/42');
  });
});
