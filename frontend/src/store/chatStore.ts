/* ============================================================
 * chatStore — 会话状态
 * ============================================================ */
import { create } from 'zustand';
import type { Session, Message } from '../types';

interface ChatStore {
  sessions: Session[];
  currentSessionId: number | null;
  messages: Record<number, Message[]>;  // sessionId → messages
  streamingContent: string;
  isStreaming: boolean;

  setSessions: (sessions: Session[]) => void;
  addSession: (session: Session) => void;
  removeSession: (id: number) => void;
  updateSession: (id: number, session: Partial<Session>) => void;
  setCurrentSessionId: (id: number | null) => void;
  setMessages: (sessionId: number, messages: Message[]) => void;
  addMessage: (sessionId: number, message: Message) => void;
  setStreamingContent: (content: string) => void;
  appendStreamingContent: (delta: string) => void;
  setIsStreaming: (v: boolean) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  sessions: [],
  currentSessionId: null,
  messages: {},
  streamingContent: '',
  isStreaming: false,

  setSessions: (sessions) => set({ sessions }),
  addSession: (session) => set((s) => ({ sessions: [session, ...s.sessions] })),
  removeSession: (id) =>
    set((s) => ({
      sessions: s.sessions.filter((x) => x.id !== id),
      currentSessionId: s.currentSessionId === id ? null : s.currentSessionId,
    })),
  updateSession: (id, partial) =>
    set((s) => ({
      sessions: s.sessions.map((x) => (x.id === id ? { ...x, ...partial } : x)),
    })),
  setCurrentSessionId: (id) => set({ currentSessionId: id }),
  setMessages: (sessionId, messages) =>
    set((s) => ({ messages: { ...s.messages, [sessionId]: messages } })),
  addMessage: (sessionId, message) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [sessionId]: [...(s.messages[sessionId] || []), message],
      },
    })),
  setStreamingContent: (content) => set({ streamingContent: content }),
  appendStreamingContent: (delta) =>
    set((s) => ({ streamingContent: s.streamingContent + delta })),
  setIsStreaming: (v) => set({ isStreaming: v }),
}));
