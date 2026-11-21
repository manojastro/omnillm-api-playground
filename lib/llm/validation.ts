import { z } from 'zod';

const keyValueSchema = z.object({
  id: z.string().max(100),
  key: z.string().max(200),
  value: z.string().max(8000),
});

export const providerConfigSchema = z.object({
  id: z.string().max(100).optional(),
  name: z.string().min(1).max(100),
  providerId: z.string().min(1).max(100),
  adapter: z.enum(['mock', 'openai', 'anthropic', 'gemini', 'custom']),
  endpoint: z.string().min(1).max(2048),
  method: z.enum(['POST', 'GET', 'PUT']),
  model: z.string().min(1).max(300),
  apiKey: z.string().max(8000),
  authType: z.enum(['bearer', 'api-key-header', 'query', 'basic', 'custom-header', 'none']),
  authHeader: z.string().max(200),
  queryKey: z.string().max(200),
  basicUsername: z.string().max(300),
  headers: z.array(keyValueSchema).max(50),
  queryParams: z.array(keyValueSchema).max(50),
  requestMode: z.enum(['openai', 'anthropic', 'gemini', 'raw']),
  requestTemplate: z.string().max(100_000),
  responsePath: z.string().max(500),
  systemPrompt: z.string().max(40_000),
  systemPromptEnabled: z.boolean(),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(1).max(1_000_000),
  topP: z.number().min(0).max(1),
  timeoutMs: z.number().int().min(1000).max(120_000),
  streaming: z.boolean(),
  directMode: z.boolean(),
  extraParameters: z.string().max(100_000),
});

export const chatMessageSchema = z.object({
  id: z.string().min(1).max(200),
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string().max(100_000),
  createdAt: z.string().max(100).optional(),
});

export const llmRequestSchema = z.object({
  config: providerConfigSchema,
  messages: z.array(chatMessageSchema).min(1).max(200),
  test: z.boolean().optional(),
});

