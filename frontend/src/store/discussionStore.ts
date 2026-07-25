/* ============================================================
 * discussionStore — 讨论状态
 * ============================================================ */
import { create } from 'zustand';
import type { DiscussionRoom, Message } from '../types';

interface DiscussionStore {
  rooms: DiscussionRoom[];
  currentRoomId: number | null;
  messages: Record<number, Message[]>;
  streamingContent: string;
  isStreaming: boolean;

  setRooms: (rooms: DiscussionRoom[]) => void;
  addRoom: (room: DiscussionRoom) => void;
  setCurrentRoomId: (id: number | null) => void;
  setMessages: (roomId: number, messages: Message[]) => void;
  addMessage: (roomId: number, message: Message) => void;
  setStreamingContent: (content: string) => void;
  appendStreamingContent: (delta: string) => void;
  setIsStreaming: (v: boolean) => void;
}

export const useDiscussionStore = create<DiscussionStore>((set) => ({
  rooms: [],
  currentRoomId: null,
  messages: {},
  streamingContent: '',
  isStreaming: false,

  setRooms: (rooms) => set({ rooms }),
  addRoom: (room) => set((s) => ({ rooms: [room, ...s.rooms] })),
  setCurrentRoomId: (id) => set({ currentRoomId: id }),
  setMessages: (roomId, messages) =>
    set((s) => ({ messages: { ...s.messages, [roomId]: messages } })),
  addMessage: (roomId, message) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [roomId]: [...(s.messages[roomId] || []), message],
      },
    })),
  setStreamingContent: (content) => set({ streamingContent: content }),
  appendStreamingContent: (delta) =>
    set((s) => ({ streamingContent: s.streamingContent + delta })),
  setIsStreaming: (v) => set({ isStreaming: v }),
}));
