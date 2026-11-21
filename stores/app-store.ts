'use client';

import { create } from 'zustand';

import { DEFAULT_CONFIG, configFromPreset } from '@/lib/llm/defaults';
import type {
  ChatMessage,
  NormalizedLLMResponse,
  ProviderConfig,
  RequestPreview,
} from '@/lib/llm/types';

const welcomeMessage: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    'Welcome to **OmniLLM**. Mock mode is live, so you can send a prompt right now—no API key needed. To connect an unfamiliar provider, open **Configure** and supply its endpoint, authentication, request template, and response path.',
  createdAt: new Date(0).toISOString(),
};

type AppState = {
  config: ProviderConfig;
  messages: ChatMessage[];
  conversationId: string;
  status: 'idle' | 'sending' | 'streaming';
  lastRequest?: RequestPreview;
  lastResponse?: NormalizedLLMResponse;
  error?: unknown;
  configOpen: boolean;
  inspectorOpen: boolean;
  inspectorTab: 'chat' | 'request' | 'response' | 'headers' | 'metrics';
  setConfig: (config: ProviderConfig) => void;
  patchConfig: (patch: Partial<ProviderConfig>) => void;
  selectPreset: (id: string) => void;
  setMessages: (messages: ChatMessage[]) => void;
  appendMessage: (message: ChatMessage) => void;
  patchMessage: (id: string, content: string) => void;
  deleteMessage: (id: string) => void;
  newChat: () => void;
  setStatus: (status: AppState['status']) => void;
  setResult: (request: RequestPreview, response: NormalizedLLMResponse) => void;
  setError: (error?: unknown) => void;
  setConfigOpen: (open: boolean) => void;
  setInspectorOpen: (open: boolean) => void;
  setInspectorTab: (tab: AppState['inspectorTab']) => void;
};

export const useAppStore = create<AppState>((set) => ({
  config: structuredClone(DEFAULT_CONFIG),
  messages: [welcomeMessage],
  conversationId: crypto.randomUUID(),
  status: 'idle',
  configOpen: true,
  inspectorOpen: true,
  inspectorTab: 'chat',
  setConfig: (config) => set({ config }),
  patchConfig: (patch) => set((state) => ({ config: { ...state.config, ...patch } })),
  selectPreset: (id) => set({ config: configFromPreset(id), error: undefined }),
  setMessages: (messages) => set({ messages }),
  appendMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  patchMessage: (id, content) => set((state) => ({
    messages: state.messages.map((message) => message.id === id ? { ...message, content } : message),
  })),
  deleteMessage: (id) => set((state) => ({ messages: state.messages.filter((message) => message.id !== id) })),
  newChat: () => set({
    messages: [welcomeMessage],
    conversationId: crypto.randomUUID(),
    lastRequest: undefined,
    lastResponse: undefined,
    error: undefined,
    status: 'idle',
  }),
  setStatus: (status) => set({ status }),
  setResult: (lastRequest, lastResponse) => set({ lastRequest, lastResponse, error: undefined }),
  setError: (error) => set({ error }),
  setConfigOpen: (configOpen) => set({ configOpen }),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
}));

