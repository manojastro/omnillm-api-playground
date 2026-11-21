import type {
  ChatMessage,
  NormalizedLLMResponse,
  NormalizedUsage,
  ProviderConfig,
  RequestPreview,
} from './types';
import { redactSecrets } from './errors';

export type BuiltRequest = {
  url: string;
  method: 'POST' | 'GET' | 'PUT';
  headers: Record<string, string>;
  body?: string;
  preview: RequestPreview;
};

const unsafePathSegments = new Set(['__proto__', 'prototype', 'constructor']);

function pathParts(path: string): Array<string | number> {
  if (!path.trim()) return [];
  const parts: Array<string | number> = [];
  const matcher = /([A-Za-z0-9_-]+)|\[(\d+)\]/g;
  let consumed = '';
  for (const match of path.matchAll(matcher)) {
    consumed += match[0];
    if (match[1]) {
      if (unsafePathSegments.has(match[1])) throw new Error('Unsafe response path.');
      parts.push(match[1]);
    } else {
      parts.push(Number(match[2]));
    }
    const next = path[consumed.length];
    if (next === '.') consumed += '.';
  }
  if (consumed !== path) throw new Error('Response path contains unsupported characters.');
  return parts;
}

export function getAtPath(value: unknown, path: string): unknown {
  let current = value;
  for (const part of pathParts(path)) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string | number, unknown>)[part];
  }
  return current;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
  }
}

export function extractText(raw: unknown, configuredPath?: string): string {
  if (typeof raw === 'string') return raw;
  if (!raw || typeof raw !== 'object') return JSON.stringify(raw, null, 2);

  const item = raw as Record<string, unknown>;
  const configured = configuredPath ? getAtPath(raw, configuredPath) : undefined;
  const detected = firstString(
    configured,
    getAtPath(raw, 'choices[0].message.content'),
    getAtPath(raw, 'choices[0].text'),
    getAtPath(raw, 'content[0].text'),
    getAtPath(raw, 'candidates[0].content.parts[0].text'),
    getAtPath(raw, 'output.text'),
    item.generation,
    item.response,
    item.answer,
    item.text,
  );
  return detected ?? JSON.stringify(raw, null, 2);
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function extractUsage(raw: unknown): NormalizedUsage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const inputTokens = asNumber(
    getAtPath(raw, 'usage.prompt_tokens') ??
      getAtPath(raw, 'usage.input_tokens') ??
      getAtPath(raw, 'usageMetadata.promptTokenCount'),
  );
  const outputTokens = asNumber(
    getAtPath(raw, 'usage.completion_tokens') ??
      getAtPath(raw, 'usage.output_tokens') ??
      getAtPath(raw, 'usageMetadata.candidatesTokenCount'),
  );
  const totalTokens = asNumber(
    getAtPath(raw, 'usage.total_tokens') ?? getAtPath(raw, 'usageMetadata.totalTokenCount'),
  );
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) return undefined;
  return {
    inputTokens,
    outputTokens,
    totalTokens: totalTokens ?? ((inputTokens ?? 0) + (outputTokens ?? 0)),
  };
}

function variableMap(config: ProviderConfig, messages: ChatMessage[]) {
  const lastUser = [...messages].reverse().find((message) => message.role === 'user');
  return {
    API_KEY: config.apiKey,
    MODEL: config.model,
    PROMPT: lastUser?.content ?? '',
    SYSTEM_PROMPT: config.systemPromptEnabled ? config.systemPrompt : '',
    MESSAGES: messages.map(({ role, content }) => ({ role, content })),
    CONVERSATION: messages.map(({ role, content }) => `${role}: ${content}`).join('\n'),
  };
}

type Variables = ReturnType<typeof variableMap>;

function replaceString(input: string, variables: Variables): unknown {
  const exact = input.match(/^\{\{([A-Z_]+)\}\}$/);
  if (exact && exact[1] in variables) return variables[exact[1] as keyof Variables];
  return input.replace(/\{\{([A-Z_]+)\}\}/g, (whole, name: string) => {
    const value = variables[name as keyof Variables];
    if (value === undefined) return whole;
    return typeof value === 'string' ? value : JSON.stringify(value);
  });
}

function replaceVariables(value: unknown, variables: Variables): unknown {
  if (typeof value === 'string') return replaceString(value, variables);
  if (Array.isArray(value)) return value.map((item) => replaceVariables(item, variables));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceVariables(item, variables)]),
    );
  }
  return value;
}

function parseExtraParameters(input: string): Record<string, unknown> {
  if (!input.trim()) return {};
  const parsed = JSON.parse(input) as unknown;
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Extra parameters must be a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

function buildBody(config: ProviderConfig, messages: ChatMessage[], variables: Variables): unknown {
  const extra = parseExtraParameters(config.extraParameters);
  const cleanMessages = messages.map(({ role, content }) => ({ role, content }));
  if (config.requestMode === 'openai') {
    return {
      model: config.model,
      messages: config.systemPromptEnabled
        ? [{ role: 'system', content: config.systemPrompt }, ...cleanMessages]
        : cleanMessages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      top_p: config.topP,
      stream: config.streaming,
      ...extra,
    };
  }
  if (config.requestMode === 'anthropic') {
    return {
      model: config.model,
      max_tokens: config.maxTokens,
      ...(config.systemPromptEnabled ? { system: config.systemPrompt } : {}),
      messages: cleanMessages.filter((message) => message.role !== 'system'),
      temperature: config.temperature,
      top_p: config.topP,
      stream: config.streaming,
      ...extra,
    };
  }
  if (config.requestMode === 'gemini') {
    return {
      contents: cleanMessages
        .filter((message) => message.role !== 'system')
        .map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }],
        })),
      ...(config.systemPromptEnabled
        ? { systemInstruction: { parts: [{ text: config.systemPrompt }] } }
        : {}),
      generationConfig: {
        temperature: config.temperature,
        maxOutputTokens: config.maxTokens,
        topP: config.topP,
        ...extra,
      },
    };
  }
  const parsed = JSON.parse(config.requestTemplate) as unknown;
  return replaceVariables(parsed, variables);
}

function encodeBasic(username: string, password: string) {
  return btoa(unescape(encodeURIComponent(`${username}:${password}`)));
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    redacted[key] = /authorization|api[-_]?key|token|secret|cookie/i.test(key)
      ? '••••••••'
      : value.replace(/Bearer\s+\S+/gi, 'Bearer ••••••••');
  }
  return redacted;
}

export function buildProviderRequest(config: ProviderConfig, messages: ChatMessage[]): BuiltRequest {
  const variables = variableMap(config, messages);
  const urlValue = replaceString(config.endpoint, variables);
  if (typeof urlValue !== 'string') throw new Error('Endpoint must resolve to text.');
  const url = new URL(urlValue);
  const headers: Record<string, string> = {};

  for (const header of config.headers) {
    if (!header.key.trim()) continue;
    const value = replaceString(header.value, variables);
    headers[header.key.trim()] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  for (const query of config.queryParams) {
    if (!query.key.trim()) continue;
    const value = replaceString(query.value, variables);
    url.searchParams.set(query.key.trim(), typeof value === 'string' ? value : JSON.stringify(value));
  }

  if (config.authType === 'bearer' && config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  if ((config.authType === 'api-key-header' || config.authType === 'custom-header') && config.apiKey) {
    headers[config.authHeader || 'X-API-Key'] = config.apiKey;
  }
  if (config.authType === 'query' && config.apiKey) url.searchParams.set(config.queryKey || 'key', config.apiKey);
  if (config.authType === 'basic' && config.apiKey) {
    headers.Authorization = `Basic ${encodeBasic(config.basicUsername, config.apiKey)}`;
  }

  const bodyValue = config.method === 'GET' ? undefined : buildBody(config, messages, variables);
  if (bodyValue !== undefined && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
    headers['Content-Type'] = 'application/json';
  }
  const body = bodyValue === undefined ? undefined : JSON.stringify(bodyValue);
  const maskedVariables: Variables = { ...variables, API_KEY: '••••••••' };
  const maskedEndpointTemplate = config.apiKey
    ? config.endpoint.split(config.apiKey).join('••••••••')
    : config.endpoint;
  const maskedEndpoint = replaceString(maskedEndpointTemplate, maskedVariables);
  if (typeof maskedEndpoint !== 'string') throw new Error('Endpoint must resolve to text.');
  const previewUrl = new URL(maskedEndpoint);
  for (const query of config.queryParams) {
    if (!query.key.trim()) continue;
    const maskedTemplate = config.apiKey
      ? query.value.split(config.apiKey).join('••••••••')
      : query.value;
    const value = replaceString(maskedTemplate, maskedVariables);
    previewUrl.searchParams.set(query.key.trim(), typeof value === 'string' ? value : JSON.stringify(value));
  }
  if (config.authType === 'query' && config.apiKey) previewUrl.searchParams.set(config.queryKey || 'key', '••••••••');
  const previewHeaders = redactSecrets(redactHeaders(headers), [config.apiKey]) as Record<string, string>;
  const previewBody = redactSecrets(bodyValue, [config.apiKey]);
  const redactedUrl = redactSecrets(previewUrl.toString(), [config.apiKey]);

  return {
    url: url.toString(),
    method: config.method,
    headers,
    body,
    preview: {
      url: typeof redactedUrl === 'string' ? redactedUrl : previewUrl.toString(),
      method: config.method,
      headers: previewHeaders,
      body: previewBody,
    },
  };
}

export function normalizeResponse(
  config: ProviderConfig,
  raw: unknown,
  statusCode: number,
  latencyMs: number,
  responseHeaders?: Record<string, string>,
): NormalizedLLMResponse {
  return {
    provider: config.name,
    model: config.model,
    content: extractText(raw, config.responsePath),
    finishReason:
      (getAtPath(raw, 'choices[0].finish_reason') as string | undefined) ??
      (getAtPath(raw, 'stop_reason') as string | undefined),
    usage: extractUsage(raw),
    latencyMs,
    statusCode,
    responseHeaders,
    raw,
  };
}

export function extractStreamDelta(adapter: ProviderConfig['adapter'], raw: unknown): string {
  if (adapter === 'anthropic') {
    return firstString(
      getAtPath(raw, 'delta.text'),
      getAtPath(raw, 'content_block.text'),
      getAtPath(raw, 'content[0].text'),
    ) ?? '';
  }
  if (adapter === 'gemini') {
    return firstString(getAtPath(raw, 'candidates[0].content.parts[0].text')) ?? '';
  }
  return firstString(
    getAtPath(raw, 'choices[0].delta.content'),
    getAtPath(raw, 'choices[0].text'),
    getAtPath(raw, 'delta'),
    getAtPath(raw, 'token.text'),
  ) ?? '';
}
