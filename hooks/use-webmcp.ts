'use client';

import { useEffect } from 'react';
import { z } from 'zod';

import { configFromPreset } from '@/lib/llm/defaults';
import { useAppStore } from '@/stores/app-store';

type ModelContextTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: object;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute(input: unknown): unknown | Promise<unknown>;
};

type ModelContext = {
  registerTool(tool: ModelContextTool, options?: { signal?: AbortSignal }): void | Promise<void>;
};

const schema = z.object({
  name: z.string().min(1).max(100).default('Custom API'),
  endpoint: z.string().url().max(2048),
  model: z.string().min(1).max(300),
  authentication: z.enum(['bearer', 'api-key-header', 'query', 'basic', 'custom-header', 'none']),
  authHeader: z.string().max(200).optional(),
  requestTemplate: z.string().max(100_000),
  responsePath: z.string().max(500).optional(),
});

export function useWebMcp() {
  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tool: ModelContextTool = {
      name: 'configure_custom_llm_api',
      title: 'Configure custom LLM API',
      description:
        'Stage a custom LLM endpoint in the visible OmniLLM connection panel. This does not send a request or save an API key.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          endpoint: { type: 'string', format: 'uri' },
          model: { type: 'string' },
          authentication: {
            type: 'string',
            enum: ['bearer', 'api-key-header', 'query', 'basic', 'custom-header', 'none'],
          },
          authHeader: { type: 'string' },
          requestTemplate: { type: 'string' },
          responsePath: { type: 'string' },
        },
        required: ['endpoint', 'model', 'authentication', 'requestTemplate'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute(input) {
        const value = schema.parse(input);
        const config = configFromPreset('custom');
        useAppStore.getState().setConfig({
          ...config,
          name: value.name,
          endpoint: value.endpoint,
          model: value.model,
          authType: value.authentication,
          authHeader: value.authHeader ?? config.authHeader,
          requestTemplate: value.requestTemplate,
          responsePath: value.responsePath ?? '',
        });
        useAppStore.getState().setConfigOpen(true);
        return {
          staged: true,
          provider: value.name,
          endpoint: value.endpoint,
          model: value.model,
          requiresApiKeyEntry: value.authentication !== 'none',
        };
      },
    };
    try {
      void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined);
    } catch {
      return;
    }
    return () => lifecycle.abort();
  }, []);
}

