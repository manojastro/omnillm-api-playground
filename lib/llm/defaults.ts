import type { ProviderConfig, ProviderPreset } from './types';

const rawTemplate = JSON.stringify(
  { model: '{{MODEL}}', prompt: '{{PROMPT}}' },
  null,
  2,
);

const base: Omit<ProviderConfig, 'apiKey'> = {
  name: 'Custom API',
  providerId: 'custom',
  adapter: 'custom',
  endpoint: 'https://api.example.com/v1/chat',
  method: 'POST',
  model: 'your-model-id',
  authType: 'api-key-header',
  authHeader: 'X-API-Key',
  queryKey: 'key',
  basicUsername: '',
  headers: [{ id: 'content-type', key: 'Content-Type', value: 'application/json' }],
  queryParams: [],
  requestMode: 'raw',
  requestTemplate: rawTemplate,
  responsePath: 'result.answer',
  systemPrompt: 'You are a helpful assistant.',
  systemPromptEnabled: false,
  temperature: 0.7,
  maxTokens: 1024,
  topP: 1,
  timeoutMs: 30000,
  streaming: false,
  directMode: false,
  extraParameters: '{}',
};

function preset(
  id: string,
  name: string,
  family: string,
  description: string,
  modelHint: string,
  color: string,
  patch: Partial<Omit<ProviderConfig, 'apiKey'>>,
): ProviderPreset {
  return {
    id,
    name,
    family,
    description,
    modelHint,
    color,
    config: { ...base, name, providerId: id, model: modelHint, ...patch },
  };
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  preset('mock', 'Mock LLM', 'Built in', 'Try chat, streaming, metrics, and errors without spending credits.', 'mock-echo-v1', '#7ce8bd', {
    adapter: 'mock', endpoint: 'mock://local', authType: 'none', requestMode: 'openai', streaming: true,
  }),
  preset('custom', 'Custom API', 'Universal', 'Define any endpoint, headers, body template, and response path.', 'your-model-id', '#f6c177', {
    adapter: 'custom', endpoint: 'https://api.example.com/v1/chat', requestMode: 'raw',
  }),
  preset('openai-compatible', 'OpenAI Compatible', 'Universal', 'One adapter for the broad OpenAI-compatible ecosystem.', 'your-model-id', '#a7c7ff', {
    adapter: 'openai', endpoint: 'https://api.example.com/v1/chat/completions', authType: 'bearer', requestMode: 'openai', responsePath: 'choices[0].message.content', streaming: true,
  }),
  preset('openai', 'OpenAI', 'Native', 'Chat Completions-compatible requests with streaming and usage extraction.', 'gpt-4.1-mini', '#9ee6c1', {
    adapter: 'openai', endpoint: 'https://api.openai.com/v1/chat/completions', authType: 'bearer', requestMode: 'openai', responsePath: 'choices[0].message.content', streaming: true,
  }),
  preset('anthropic', 'Anthropic Claude', 'Native', 'Anthropic Messages format with native headers and streaming.', 'claude-sonnet-5', '#e9b58f', {
    adapter: 'anthropic', endpoint: 'https://api.anthropic.com/v1/messages', authType: 'api-key-header', authHeader: 'x-api-key', headers: [
      { id: 'content-type', key: 'Content-Type', value: 'application/json' },
      { id: 'anthropic-version', key: 'anthropic-version', value: '2023-06-01' },
    ], requestMode: 'anthropic', responsePath: 'content[0].text', streaming: true,
  }),
  preset('gemini', 'Google Gemini', 'Native', 'Gemini generateContent request and candidate extraction.', 'gemini-3.7-flash', '#8ab4f8', {
    adapter: 'gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{{MODEL}}:generateContent', authType: 'query', queryKey: 'key', requestMode: 'gemini', responsePath: 'candidates[0].content.parts[0].text',
  }),
  preset('groq', 'Groq', 'OpenAI compatible', 'Low-latency OpenAI-compatible inference.', 'llama-3.3-70b-versatile', '#f39c6b', {
    adapter: 'openai', endpoint: 'https://api.groq.com/openai/v1/chat/completions', authType: 'bearer', requestMode: 'openai', responsePath: 'choices[0].message.content', streaming: true,
  }),
  preset('openrouter', 'OpenRouter', 'OpenAI compatible', 'Route prompts across many hosted models.', 'openrouter/auto', '#a88bfa', {
    adapter: 'openai', endpoint: 'https://openrouter.ai/api/v1/chat/completions', authType: 'bearer', requestMode: 'openai', responsePath: 'choices[0].message.content', streaming: true,
  }),
  preset('together', 'Together AI', 'OpenAI compatible', 'Open-source models through an editable compatible endpoint.', 'Qwen/Qwen3.5-9B', '#fb7185', {
    adapter: 'openai', endpoint: 'https://api.together.ai/v1/chat/completions', authType: 'bearer', requestMode: 'openai', responsePath: 'choices[0].message.content', streaming: true,
  }),
  preset('fireworks', 'Fireworks AI', 'OpenAI compatible', 'Fast compatible chat-completion inference.', 'accounts/fireworks/models/kimi-k2p5', '#ff8f70', {
    adapter: 'openai', endpoint: 'https://api.fireworks.ai/inference/v1/chat/completions', authType: 'bearer', requestMode: 'openai', responsePath: 'choices[0].message.content', streaming: true,
  }),
  preset('mistral', 'Mistral', 'OpenAI compatible', 'Mistral chat completions with familiar request shape.', 'mistral-small-latest', '#ff9d42', {
    adapter: 'openai', endpoint: 'https://api.mistral.ai/v1/chat/completions', authType: 'bearer', requestMode: 'openai', responsePath: 'choices[0].message.content', streaming: true,
  }),
  preset('deepseek', 'DeepSeek', 'OpenAI compatible', 'DeepSeek models using the shared compatible adapter.', 'deepseek-v4-flash', '#7289ff', {
    adapter: 'openai', endpoint: 'https://api.deepseek.com/chat/completions', authType: 'bearer', requestMode: 'openai', responsePath: 'choices[0].message.content', streaming: true,
  }),
  preset('xai', 'xAI', 'OpenAI compatible', 'Grok models through an editable compatible endpoint.', 'grok-4.6', '#e8e8e8', {
    adapter: 'openai', endpoint: 'https://api.x.ai/v1/chat/completions', authType: 'bearer', requestMode: 'openai', responsePath: 'choices[0].message.content', streaming: true,
  }),
  preset('perplexity', 'Perplexity', 'OpenAI compatible', 'Search-aware models through the Sonar API.', 'sonar', '#52d3c4', {
    adapter: 'openai', endpoint: 'https://api.perplexity.ai/v1/sonar', authType: 'bearer', requestMode: 'openai', responsePath: 'choices[0].message.content', streaming: true,
  }),
  preset('cohere', 'Cohere', 'Preset', 'Editable Cohere v2 chat request preset.', 'command-a-plus-05-2026', '#d7ff79', {
    adapter: 'custom', endpoint: 'https://api.cohere.ai/v2/chat', authType: 'bearer', requestMode: 'raw', requestTemplate: JSON.stringify({ model: '{{MODEL}}', messages: '{{MESSAGES}}' }, null, 2), responsePath: 'message.content[0].text',
  }),
  preset('nvidia', 'NVIDIA NIM', 'OpenAI compatible', 'NVIDIA-hosted compatible model endpoints.', 'meta/llama-3.1-8b-instruct', '#76b900', {
    adapter: 'openai', endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions', authType: 'bearer', requestMode: 'openai', responsePath: 'choices[0].message.content', streaming: true,
  }),
  preset('cerebras', 'Cerebras', 'OpenAI compatible', 'Compatible inference on Cerebras systems.', 'gpt-oss-120b', '#ff7a59', {
    adapter: 'openai', endpoint: 'https://api.cerebras.ai/v1/chat/completions', authType: 'bearer', requestMode: 'openai', responsePath: 'choices[0].message.content', streaming: true,
  }),
  preset('sambanova', 'SambaNova', 'OpenAI compatible', 'Editable compatible cloud endpoint.', 'gpt-oss-120b', '#f5674a', {
    adapter: 'openai', endpoint: 'https://api.sambanova.ai/v1/chat/completions', authType: 'bearer', requestMode: 'openai', responsePath: 'choices[0].message.content', streaming: true,
  }),
  preset('ollama', 'Ollama', 'Local / direct', 'Talk to an Ollama server running on this device.', 'gpt-oss:20b', '#d8d8d8', {
    adapter: 'openai', endpoint: 'http://localhost:11434/v1/chat/completions', authType: 'none', requestMode: 'openai', directMode: true, streaming: true,
  }),
  preset('lm-studio', 'LM Studio', 'Local / direct', 'Use LM Studio’s local OpenAI-compatible server.', 'local-model', '#9b87f5', {
    adapter: 'openai', endpoint: 'http://localhost:1234/v1/chat/completions', authType: 'none', requestMode: 'openai', directMode: true, streaming: true,
  }),
  preset('localai', 'LocalAI', 'Local / direct', 'Connect to a local compatible gateway.', 'local-model', '#6dc7a8', {
    adapter: 'openai', endpoint: 'http://127.0.0.1:8080/v1/chat/completions', authType: 'none', requestMode: 'openai', directMode: true, streaming: true,
  }),
  preset('vllm', 'vLLM', 'Local / direct', 'Connect to a locally served vLLM endpoint.', 'your-model-id', '#64b5f6', {
    adapter: 'openai', endpoint: 'http://127.0.0.1:8000/v1/chat/completions', authType: 'none', requestMode: 'openai', directMode: true, streaming: true,
  }),
];

export function configFromPreset(id: string): ProviderConfig {
  const selected = PROVIDER_PRESETS.find((item) => item.id === id) ?? PROVIDER_PRESETS[0];
  return { ...structuredClone(selected.config), apiKey: '' };
}

export const DEFAULT_CONFIG = configFromPreset('mock');
