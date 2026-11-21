export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt?: string;
};

export type AuthType =
  | 'bearer'
  | 'api-key-header'
  | 'query'
  | 'basic'
  | 'custom-header'
  | 'none';

export type RequestMode = 'openai' | 'anthropic' | 'gemini' | 'raw';
export type RequestMethod = 'POST' | 'GET' | 'PUT';

export type KeyValue = { id: string; key: string; value: string };

export type ProviderConfig = {
  id?: string;
  name: string;
  providerId: string;
  adapter: 'mock' | 'openai' | 'anthropic' | 'gemini' | 'custom';
  endpoint: string;
  method: RequestMethod;
  model: string;
  apiKey: string;
  authType: AuthType;
  authHeader: string;
  queryKey: string;
  basicUsername: string;
  headers: KeyValue[];
  queryParams: KeyValue[];
  requestMode: RequestMode;
  requestTemplate: string;
  responsePath: string;
  systemPrompt: string;
  systemPromptEnabled: boolean;
  temperature: number;
  maxTokens: number;
  topP: number;
  timeoutMs: number;
  streaming: boolean;
  directMode: boolean;
  extraParameters: string;
};

export type NormalizedUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type NormalizedLLMResponse = {
  provider: string;
  model?: string;
  content: string;
  finishReason?: string;
  usage?: NormalizedUsage;
  latencyMs: number;
  ttftMs?: number;
  statusCode: number;
  responseHeaders?: Record<string, string>;
  raw: unknown;
};

export type RequestPreview = {
  url: string;
  method: RequestMethod;
  headers: Record<string, string>;
  body: unknown;
};

export type RequestRecord = {
  id: string;
  conversationId: string;
  provider: string;
  model: string;
  messages: ChatMessage[];
  responseText: string;
  statusCode: number;
  latencyMs: number;
  usage?: NormalizedUsage;
  request?: RequestPreview;
  response?: unknown;
  createdAt: string;
};

export type SavedProfile = {
  id: string;
  name: string;
  config: Omit<ProviderConfig, 'apiKey'>;
  createdAt: string;
  updatedAt: string;
};

export type ProviderPreset = {
  id: string;
  name: string;
  family: string;
  description: string;
  modelHint: string;
  color: string;
  config: Omit<ProviderConfig, 'apiKey'>;
};

export type LLMRequestPayload = {
  config: ProviderConfig;
  messages: ChatMessage[];
  test?: boolean;
};

