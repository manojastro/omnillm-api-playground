'use client';

import {
  buildProviderRequest,
  extractStreamDelta,
  extractUsage,
  normalizeResponse,
} from '@/lib/llm/adapters';
import { normalizeError, redactSecrets } from '@/lib/llm/errors';
import type {
  ChatMessage,
  LLMRequestPayload,
  NormalizedLLMResponse,
  ProviderConfig,
  RequestPreview,
} from '@/lib/llm/types';

type StreamEvent = {
  type: 'delta' | 'done' | 'error';
  content?: string;
  error?: unknown;
} & Partial<NormalizedLLMResponse>;

async function parseNormalizedStream(
  response: Response,
  signal: AbortSignal,
  onDelta: (delta: string) => void,
) {
  const reader = response.body?.getReader();
  if (!reader) throw normalizeError(502, { message: 'The response stream was empty.' });
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let completed: StreamEvent | undefined;
  while (true) {
    if (signal.aborted) {
      await reader.cancel();
      throw new DOMException('Generation stopped.', 'AbortError');
    }
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? '';
    for (const block of events) {
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n');
      if (!data || data === '[DONE]') continue;
      const event = JSON.parse(data) as StreamEvent;
      if (event.type === 'delta' && event.content) {
        content += event.content;
        onDelta(event.content);
      }
      if (event.type === 'error') throw event.error ?? normalizeError(502);
      if (event.type === 'done') completed = event;
    }
  }
  if (!completed) throw normalizeError(502, { message: 'The stream ended before completion.' });
  return { ...completed, content: completed.content ?? content } as NormalizedLLMResponse;
}

async function parseDirectStream(
  response: Response,
  config: ProviderConfig,
  started: number,
  signal: AbortSignal,
  onDelta: (delta: string) => void,
) {
  const reader = response.body?.getReader();
  if (!reader) throw normalizeError(502, { message: 'The response stream was empty.' });
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let ttftMs: number | undefined;
  let usage: ReturnType<typeof extractUsage>;
  while (true) {
    if (signal.aborted) {
      await reader.cancel();
      throw new DOMException('Generation stopped.', 'AbortError');
    }
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? '';
    for (const block of events) {
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n');
      if (!data || data === '[DONE]') continue;
      try {
        const raw = JSON.parse(data) as unknown;
        const delta = extractStreamDelta(config.adapter, raw);
        usage = extractUsage(raw) ?? usage;
        if (delta) {
          if (ttftMs === undefined) ttftMs = Math.round(performance.now() - started);
          content += delta;
          onDelta(delta);
        }
      } catch {
        // Some local servers emit keep-alives or metadata events.
      }
    }
  }
  return {
    provider: config.name,
    model: config.model,
    content,
    latencyMs: Math.round(performance.now() - started),
    ttftMs,
    statusCode: response.status,
    usage,
    raw: { streamed: true, content },
  } satisfies NormalizedLLMResponse;
}

async function directRequest(
  payload: LLMRequestPayload,
  signal: AbortSignal,
  onDelta: (delta: string) => void,
) {
  const built = buildProviderRequest(payload.config, payload.messages);
  const url = new URL(built.url);
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(isLocal && url.protocol === 'http:')) {
    throw normalizeError(400, { message: 'Direct mode allows HTTPS endpoints and HTTP localhost only.' });
  }
  const started = performance.now();
  const response = await fetch(built.url, {
    method: built.method,
    headers: built.headers,
    body: built.method === 'GET' ? undefined : built.body,
    signal,
  });
  if (!response.ok) {
    const text = (await response.text()).slice(0, 250_000);
    let raw: unknown = text;
    try { raw = JSON.parse(text); } catch { /* valid text error */ }
    throw normalizeError(response.status, redactSecrets(raw, [payload.config.apiKey]));
  }
  if (payload.config.streaming && response.headers.get('content-type')?.includes('text/event-stream')) {
    return parseDirectStream(response, payload.config, started, signal, onDelta);
  }
  const text = (await response.text()).slice(0, 5_000_000);
  let raw: unknown = text;
  try { raw = JSON.parse(text); } catch { /* valid text response */ }
  const safeRaw = redactSecrets(raw, [payload.config.apiKey]);
  return normalizeResponse(
    payload.config,
    safeRaw,
    response.status,
    Math.round(performance.now() - started),
    Object.fromEntries(response.headers.entries()),
  );
}

export async function executeLLM(
  payload: LLMRequestPayload,
  signal: AbortSignal,
  onDelta: (delta: string) => void = () => undefined,
): Promise<{ response: NormalizedLLMResponse; preview: RequestPreview }> {
  const preview = buildProviderRequest(payload.config, payload.messages).preview;
  if (payload.config.directMode) {
    return { response: await directRequest(payload, signal, onDelta), preview };
  }

  const response = await fetch('/api/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  if (response.headers.get('content-type')?.includes('text/event-stream')) {
    return { response: await parseNormalizedStream(response, signal, onDelta), preview };
  }
  const data = (await response.json()) as { response?: NormalizedLLMResponse; error?: unknown };
  if (!response.ok || !data.response) throw data.error ?? normalizeError(response.status);
  return { response: data.response, preview };
}

export function testMessage(): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    content: 'Reply with OK to confirm this connection.',
    createdAt: new Date().toISOString(),
  };
}
