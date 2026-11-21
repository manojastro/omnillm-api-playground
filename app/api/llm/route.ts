import { NextResponse } from 'next/server';

import {
  buildProviderRequest,
  extractStreamDelta,
  extractUsage,
  normalizeResponse,
} from '@/lib/llm/adapters';
import { normalizeError, redactSecrets } from '@/lib/llm/errors';
import type { ProviderConfig } from '@/lib/llm/types';
import { llmRequestSchema } from '@/lib/llm/validation';
import { enforceRateLimit } from '@/lib/server/database';
import { fetchWithSafeRedirects, safeResponseHeaders } from '@/lib/server/security';

export const runtime = 'edge';

const encoder = new TextEncoder();
const MAX_REQUEST_BYTES = 1_000_000;

class RequestTooLargeError extends Error {}

async function readJsonBody(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_REQUEST_BYTES) throw new RequestTooLargeError();
  if (!request.body) throw new Error('Expected a JSON request body.');
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new RequestTooLargeError();
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return JSON.parse(text);
}

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...init?.headers,
    },
  });
}

function mockText(prompt: string) {
  const lower = prompt.toLowerCase();
  if (lower.includes('unfamiliar') || lower.includes('custom api')) {
    return 'Absolutely. Choose Custom API, enter the endpoint and model, select the authentication method, then paste the provider\'s JSON request template. Set a response path such as `result.answer`, and OmniLLM will translate the response into the chat without a code change.';
  }
  if (lower.includes('hello')) {
    return 'Hello! I’m the built-in Mock LLM. The complete chat, inspector, history, export, and comparison flows work without an API key.';
  }
  return `This is a simulated response to: “${prompt.slice(0, 240)}”\n\nSwitch providers at any time, or open **Configure** to test a real endpoint. Mock mode never sends this prompt to a third party.`;
}

function mockUsage(prompt: string, content: string) {
  const inputTokens = Math.max(4, Math.ceil(prompt.length / 4));
  const outputTokens = Math.max(8, Math.ceil(content.length / 4));
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

function mockStream(config: ProviderConfig, prompt: string) {
  const content = mockText(prompt);
  const words = content.match(/\S+\s*/g) ?? [content];
  const started = performance.now();
  return new ReadableStream({
    async start(controller) {
      let ttftMs = 0;
      for (let index = 0; index < words.length; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, index === 0 ? 180 : 20));
        if (index === 0) ttftMs = Math.round(performance.now() - started);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', content: words[index] })}\n\n`));
      }
      const latencyMs = Math.round(performance.now() - started);
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: 'done',
            provider: config.name,
            model: config.model,
            content,
            statusCode: 200,
            latencyMs,
            ttftMs,
            usage: mockUsage(prompt, content),
            responseHeaders: { 'x-omnillm-mock': 'true' },
            raw: { simulated: true, content },
          })}\n\n`,
        ),
      );
      controller.close();
    },
  });
}

async function readLimited(response: Response, maxBytes = 5_000_000) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let output = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('The provider response exceeded the 5 MB safety limit.');
    }
    output += decoder.decode(value, { stream: true });
  }
  return output + decoder.decode();
}

function normalizedUpstreamStream(
  response: Response,
  config: ProviderConfig,
  started: number,
  onFinished: () => void,
) {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let ttftMs: number | undefined;
  let usage: unknown;
  let fullText = '';
  let totalBytes = 0;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    onFinished();
  };

  return new ReadableStream({
    async pull(controller) {
      if (!reader) {
        controller.error(new Error('The provider returned an empty stream.'));
        return;
      }
      try {
        const { value, done } = await reader.read();
        if (done) {
          const latencyMs = Math.round(performance.now() - started);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'done',
                provider: config.name,
                model: config.model,
                content: fullText,
                statusCode: response.status,
                latencyMs,
                ttftMs,
                usage,
                responseHeaders: safeResponseHeaders(response.headers),
                raw: { streamed: true, content: fullText },
              })}\n\n`,
            ),
          );
          finish();
          controller.close();
          return;
        }
        totalBytes += value.byteLength;
        if (totalBytes > 5_000_000) throw new Error('The provider stream exceeded the 5 MB safety limit.');
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? '';
        for (const event of events) {
          const data = event
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim())
            .join('\n');
          if (!data || data === '[DONE]') continue;
          try {
            const parsed = redactSecrets(JSON.parse(data) as unknown, [config.apiKey]);
            const delta = extractStreamDelta(config.adapter, parsed);
            const extractedUsage = extractUsage(parsed);
            if (extractedUsage) usage = extractedUsage;
            if (delta) {
              if (ttftMs === undefined) ttftMs = Math.round(performance.now() - started);
              fullText += delta;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', content: delta })}\n\n`));
            }
          } catch {
            // Unknown event shapes are ignored; the final inspector still records the stream.
          }
        }
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'error',
              error: normalizeError(502, { message: error instanceof Error ? error.message : 'Stream failed.' }),
            })}\n\n`,
          ),
        );
        finish();
        controller.close();
      }
    },
    cancel() {
      finish();
      void reader?.cancel();
    },
  });
}

export async function POST(request: Request) {
  let untrusted: unknown;
  try {
    untrusted = await readJsonBody(request);
  } catch (error) {
    if (error instanceof RequestTooLargeError) return json({ error: normalizeError(413) }, { status: 413 });
    return json({ error: normalizeError(400, { message: 'Expected a JSON request body.' }) }, { status: 400 });
  }
  const parsed = llmRequestSchema.safeParse(untrusted);
  if (!parsed.success) {
    return json({ error: normalizeError(400, { message: 'Configuration validation failed.', fields: parsed.error.flatten().fieldErrors }) }, { status: 400 });
  }

  const { config, messages, test } = parsed.data;
  const prompt = [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';
  if (config.adapter === 'mock') {
    if (prompt.toLowerCase().includes('[error:429]')) return json({ error: normalizeError(429, { simulated: true }) }, { status: 429 });
    if (config.streaming && !test) {
      return new Response(mockStream(config, prompt), {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    }
    const content = test ? 'Connected — mock provider is ready.' : mockText(prompt);
    const latencyMs = test ? 72 : 260;
    await new Promise((resolve) => setTimeout(resolve, latencyMs));
    const raw = { simulated: true, choices: [{ message: { content }, finish_reason: 'stop' }] };
    return json({
      response: {
        ...normalizeResponse(config, raw, 200, latencyMs, { 'x-omnillm-mock': 'true' }),
        usage: mockUsage(prompt, content),
      },
    });
  }

  if (config.directMode) return json({ error: normalizeError(400, { message: 'Direct mode requests must be sent from the browser.' }) }, { status: 400 });

  try {
    const rate = await enforceRateLimit(request);
    if (!rate.allowed) {
      return json({ error: normalizeError(429), resetAt: rate.resetAt }, { status: 429, headers: { 'X-RateLimit-Remaining': '0' } });
    }
  } catch {
    return json({ error: normalizeError(503, { message: 'The request guard is temporarily unavailable.' }) }, { status: 503 });
  }

  const started = performance.now();
  const timeout = new AbortController();
  const timeoutId = setTimeout(() => timeout.abort('timeout'), config.timeoutMs);
  let streamOwnsTimeout = false;
  request.signal.addEventListener('abort', () => timeout.abort('client-aborted'), { once: true });

  try {
    const built = buildProviderRequest(config, messages);
    const response = await fetchWithSafeRedirects(built, timeout.signal);
    const headers = safeResponseHeaders(response.headers);

    if (!response.ok) {
      const bodyText = await readLimited(response, 250_000);
      let rawError: unknown = bodyText;
      try { rawError = JSON.parse(bodyText); } catch { /* keep provider text */ }
      const safeError = redactSecrets(rawError, [config.apiKey]);
      return json({ error: normalizeError(response.status, safeError), responseHeaders: headers }, { status: response.status });
    }

    const isEventStream = response.headers.get('content-type')?.includes('text/event-stream');
    if (config.streaming && isEventStream && !test) {
      streamOwnsTimeout = true;
      return new Response(normalizedUpstreamStream(response, config, started, () => clearTimeout(timeoutId)), {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    const bodyText = await readLimited(response);
    let raw: unknown = bodyText;
    try { raw = JSON.parse(bodyText); } catch { /* text APIs are valid */ }
    raw = redactSecrets(raw, [config.apiKey]);
    const latencyMs = Math.round(performance.now() - started);
    return json({ response: normalizeResponse(config, raw, response.status, latencyMs, headers) });
  } catch (error) {
    const timedOut = timeout.signal.aborted && timeout.signal.reason === 'timeout';
    const status = timedOut ? 408 : 502;
    return json(
      {
        error: normalizeError(status, {
          message: timedOut
            ? 'The provider did not respond before the configured timeout.'
            : error instanceof Error
              ? redactSecrets(error.message, [config.apiKey])
              : 'Could not reach the provider.',
        }),
      },
      { status },
    );
  } finally {
    if (!streamOwnsTimeout) clearTimeout(timeoutId);
  }
}
