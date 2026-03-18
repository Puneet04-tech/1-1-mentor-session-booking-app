import { create } from 'zustand';
import { User, Session, Message } from '@/types';

interface SessionStore {
  currentSession: Session | null;
  messages: Message[];
  participants: User[];
  
  setCurrentSession: (session: Session | null) => void;
  addMessage: (message: Message) => void;
  setMessages: (messages: Message[]) => void;
  addParticipant: (user: User) => void;
  removeParticipant: (userId: string) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  currentSession: null,
  messages: [],
  participants: [],

  setCurrentSession: (session) => set({ currentSession: session }),
  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),
  setMessages: (messages) => set({ messages }),
  addParticipant: (user) =>
    set((state) => ({
      participants: [...state.participants.filter((p) => p.id !== user.id), user],
    })),
  removeParticipant: (userId) =>
    set((state) => ({
      participants: state.participants.filter((p) => p.id !== userId),
    })),
  clearSession: () =>
    set({
      currentSession: null,
      messages: [],
      participants: [],
    }),
}));

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  token: string | null;

  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isAuthenticated: false,
  loading: false,
  token: null,

  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setToken: (token) => set({ token }),
  setLoading: (loading) => set({ loading }),
  logout: () => set({ user: null, isAuthenticated: false, token: null }),
}));

interface EditorStore {
  code: string;
  language: string;
  isExecuting: boolean;
  executionOutput: string;
  theme: 'light' | 'dark';

  setCode: (code: string) => void;
  setLanguage: (language: string) => void;
  setIsExecuting: (isExecuting: boolean) => void;
  setExecutionOutput: (output: string) => void;
  setTheme: (theme: 'light' | 'dark') => void;
}

export const useEditorStore = create<EditorStore>((set) => ({
  code: '',
  language: 'javascript',
  isExecuting: false,
  executionOutput: '',
  theme: 'dark',

  setCode: (code) => set({ code }),
  setLanguage: (language) => set({ language }),
  setIsExecuting: (isExecuting) => set({ isExecuting }),
  setExecutionOutput: (output) => set({ executionOutput: output }),
  setTheme: (theme) => set({ theme }),
}));

interface VideoStore {
  isCameraOn: boolean;
  isMicOn: boolean;
  isScreenSharing: boolean;
  remoteStream: MediaStream | null;
  localStream: MediaStream | null;

  toggleCamera: () => void;
  toggleMic: () => void;
  toggleScreenShare: () => void;
  setRemoteStream: (stream: MediaStream | null) => void;
  setLocalStream: (stream: MediaStream | null) => void;
}

export const useVideoStore = create<VideoStore>((set) => ({
  isCameraOn: true,
  isMicOn: true,
  isScreenSharing: false,
  remoteStream: null,
  localStream: null,

  toggleCamera: () => set((state) => ({ isCameraOn: !state.isCameraOn })),
  toggleMic: () => set((state) => ({ isMicOn: !state.isMicOn })),
  toggleScreenShare: () => set((state) => ({ isScreenSharing: !state.isScreenSharing })),
  setRemoteStream: (stream) => set({ remoteStream: stream }),
  setLocalStream: (stream) => set({ localStream: stream }),
}));
