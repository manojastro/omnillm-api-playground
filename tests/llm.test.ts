import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProviderRequest,
  extractStreamDelta,
  extractText,
  getAtPath,
  normalizeResponse,
} from '../lib/llm/adapters';
import { configFromPreset } from '../lib/llm/defaults';
import { normalizeError, redactSecrets } from '../lib/llm/errors';
import { configForStorage, profileContainsCredentials } from '../lib/llm/privacy';
import { assertSafeUpstreamUrl, sanitizeUpstreamHeaders } from '../lib/server/security';

test('custom API acceptance case builds without code changes', () => {
  const config = configFromPreset('custom');
  config.endpoint = 'https://some-new-provider.com/v1/chat';
  config.apiKey = 'abc123';
  config.model = 'new-super-model';
  config.authType = 'api-key-header';
  config.authHeader = 'X-API-Key';
  config.requestTemplate = '{"model":"{{MODEL}}","prompt":"{{PROMPT}}"}';
  config.responsePath = 'result.answer';
  const built = buildProviderRequest(config, [{ id: 'message-1', role: 'user', content: 'Hello', createdAt: new Date().toISOString() }]);
  assert.deepEqual(JSON.parse(built.body ?? ''), { model: 'new-super-model', prompt: 'Hello' });
  assert.equal(built.headers['X-API-Key'], 'abc123');
  assert.equal(built.preview.headers['X-API-Key'], '••••••••');
  assert.equal(extractText({ result: { answer: 'Hello! How can I help?' } }, config.responsePath), 'Hello! How can I help?');
});

test('template substitution preserves quotes and newlines safely', () => {
  const config = configFromPreset('custom');
  config.apiKey = 'top-secret';
  config.requestTemplate = '{"prompt":"{{PROMPT}}","messages":"{{MESSAGES}}"}';
  const messages = [{ id: 'message-1', role: 'user' as const, content: 'Say "hello"\nthen stop.' }];
  const body = JSON.parse(buildProviderRequest(config, messages).body ?? '');
  assert.equal(body.prompt, messages[0].content);
  assert.deepEqual(body.messages, [{ role: 'user', content: messages[0].content }]);
});

test('request previews redact the configured key everywhere', () => {
  const config = configFromPreset('custom');
  config.apiKey = 'SECRET-1234';
  config.endpoint = 'https://api.example.com/chat?credential={{API_KEY}}';
  config.headers = [{ id: 'credential', key: 'X-Credential', value: '{{API_KEY}}' }];
  config.requestTemplate = '{"credential":"{{API_KEY}}","prompt":"{{PROMPT}}"}';
  const built = buildProviderRequest(config, [{ id: 'message-1', role: 'user', content: 'Hello' }]);
  const preview = JSON.stringify(built.preview);
  assert.equal(preview.includes('SECRET-1234'), false);
  assert.match(preview, /••••••••/);
  assert.equal(built.url.includes('SECRET-1234'), true);
  assert.equal(built.body?.includes('SECRET-1234'), true);
});

test('request previews redact URL-encoded key characters', () => {
  const config = configFromPreset('custom');
  config.apiKey = 'abc+def/ghi==';
  config.queryParams = [{ id: 'credential', key: 'credential', value: '{{API_KEY}}' }];
  const preview = buildProviderRequest(config, [{ id: 'message-1', role: 'user', content: 'Hello' }]).preview.url;
  assert.equal(preview.includes('abc%2Bdef%2Fghi%3D%3D'), false);
  assert.match(decodeURIComponent(preview), /••••••••/);
});

test('profile storage replaces active key literals and rejects imported credentials', () => {
  const config = configFromPreset('custom');
  config.apiKey = 'SECRET-1234';
  config.headers = [{ id: 'credential', key: 'X-Credential', value: 'Bearer SECRET-1234' }];
  const safe = configForStorage(config);
  assert.equal(JSON.stringify(safe).includes('SECRET-1234'), false);
  assert.equal(profileContainsCredentials(safe), false);
  assert.equal(profileContainsCredentials({ ...safe, headers: [{ id: 'credential', key: 'X-Credential', value: 'literal-secret' }] }), true);
  assert.equal(profileContainsCredentials({ ...safe, authType: 'custom-header', authHeader: 'X-Company-Key', headers: [{ id: 'credential', key: 'X-Company-Key', value: 'totally-secret-random-value' }] }), true);
});

test('safe JSON path parser supports arrays and blocks prototypes', () => {
  assert.equal(getAtPath({ choices: [{ message: { content: 'ok' } }] }, 'choices[0].message.content'), 'ok');
  assert.throws(() => getAtPath({}, '__proto__.polluted'), /Unsafe/);
});

test('unknown response shape falls back to formatted JSON', () => {
  const text = extractText({ unfamiliar: { nested: 42 } }, 'missing.value');
  assert.match(text, /"unfamiliar"/);
  assert.match(text, /42/);
});

test('usage and finish reason normalize from provider response', () => {
  const config = configFromPreset('openai');
  const response = normalizeResponse(config, {
    choices: [{ message: { content: 'done' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
  }, 200, 120);
  assert.equal(response.content, 'done');
  assert.equal(response.finishReason, 'stop');
  assert.deepEqual(response.usage, { inputTokens: 4, outputTokens: 2, totalTokens: 6 });
  assert.deepEqual(redactSecrets(response.usage), { inputTokens: 4, outputTokens: 2, totalTokens: 6 });
});

test('OpenAI-compatible requests include an enabled system prompt', () => {
  const config = configFromPreset('openai');
  config.systemPromptEnabled = true;
  config.systemPrompt = 'Be concise.';
  const body = JSON.parse(buildProviderRequest(config, [{ id: 'message-1', role: 'user', content: 'Hello' }]).body ?? '');
  assert.deepEqual(body.messages[0], { role: 'system', content: 'Be concise.' });
});

test('stream deltas normalize across known event shapes', () => {
  assert.equal(extractStreamDelta('openai', { choices: [{ delta: { content: 'A' } }] }), 'A');
  assert.equal(extractStreamDelta('anthropic', { delta: { text: 'B' } }), 'B');
  assert.equal(extractStreamDelta('gemini', { candidates: [{ content: { parts: [{ text: 'C' }] } }] }), 'C');
});

test('errors map provider status and redact secrets', () => {
  assert.equal(normalizeError(401).code, 'authentication_failed');
  assert.equal(normalizeError(429).code, 'rate_limited');
  assert.deepEqual(redactSecrets({ Authorization: 'Bearer abc123', api_key: 'abc123' }, ['abc123']), { Authorization: '••••••••', api_key: '••••••••' });
});

test('hosted URL guard blocks private targets and unsafe headers', () => {
  assert.equal(assertSafeUpstreamUrl('https://api.example.com/v1/chat').hostname, 'api.example.com');
  assert.throws(() => assertSafeUpstreamUrl('http://localhost:11434/v1/chat'), /HTTPS/);
  assert.throws(() => assertSafeUpstreamUrl('https://127.0.0.1/v1/chat'), /Private/);
  assert.throws(() => assertSafeUpstreamUrl('https://169.254.169.254/latest/meta-data'), /Private/);
  assert.throws(() => assertSafeUpstreamUrl('https://[::ffff:127.0.0.1]/v1/chat'), /Private/);
  const headers = sanitizeUpstreamHeaders({ Host: 'evil.test', Cookie: 'secret', 'X-API-Key': 'abc', 'Content-Type': 'application/json' });
  assert.equal(headers.has('host'), false);
  assert.equal(headers.has('cookie'), false);
  assert.equal(headers.get('x-api-key'), 'abc');
});
