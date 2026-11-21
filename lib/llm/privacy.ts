import { isSensitiveKey } from './errors';
import type { ProviderConfig } from './types';

const KEY_PLACEHOLDER = '{{API_KEY}}';
const placeholderPattern = /\{\{API_KEY\}\}|•{4,}/i;
const commonCredentialPattern = /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{12,}|AIza[A-Za-z0-9_-]{20,}|hf_[A-Za-z0-9]{16,}|xai-[A-Za-z0-9_-]{12,})\b/;

function replaceLiteral(value: unknown, secret: string): unknown {
  if (!secret) return value;
  if (typeof value === 'string') return value.split(secret).join(KEY_PLACEHOLDER);
  if (Array.isArray(value)) return value.map((item) => replaceLiteral(item, secret));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceLiteral(item, secret)]),
    );
  }
  return value;
}

export function configForStorage(config: ProviderConfig): Omit<ProviderConfig, 'apiKey'> {
  const { apiKey, ...withoutApiKey } = config;
  return replaceLiteral(withoutApiKey, apiKey) as Omit<ProviderConfig, 'apiKey'>;
}

function credentialValueLooksUnsafe(value: unknown): boolean {
  if (typeof value !== 'string') return value !== undefined && value !== null;
  const trimmed = value.trim();
  return Boolean(trimmed && !placeholderPattern.test(trimmed));
}

function objectContainsCredentials(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(objectContainsCredentials);
  if (!value || typeof value !== 'object') {
    return typeof value === 'string' && commonCredentialPattern.test(value);
  }
  return Object.entries(value).some(([key, item]) =>
    (isSensitiveKey(key) && credentialValueLooksUnsafe(item)) || objectContainsCredentials(item),
  );
}

function textContainsCredentials(value: string): boolean {
  if (commonCredentialPattern.test(value)) return true;
  try {
    return objectContainsCredentials(JSON.parse(value));
  } catch {
    return /(?:authorization|api[-_]?key|access[-_]?token|secret|password|credential)\s*["']?\s*[:=]\s*["']?(?!\{\{API_KEY\}\}|•{4,})\S+/i.test(value);
  }
}

export function profileContainsCredentials(config: Omit<ProviderConfig, 'apiKey'>): boolean {
  const configuredHeader = (config.authType === 'api-key-header' || config.authType === 'custom-header')
    ? config.authHeader.trim().toLowerCase()
    : '';
  const configuredQuery = config.authType === 'query' ? config.queryKey.trim().toLowerCase() : '';
  try {
    const endpoint = new URL(config.endpoint);
    if (endpoint.username || endpoint.password) return true;
    for (const [key, value] of endpoint.searchParams) {
      if ((isSensitiveKey(key) || key.toLowerCase() === configuredQuery) && credentialValueLooksUnsafe(value)) return true;
    }
  } catch {
    // Endpoint validity is handled by the request builder; still scan the raw text below.
  }
  if (commonCredentialPattern.test(config.endpoint)) return true;
  if (config.headers.some((item) =>
    ((isSensitiveKey(item.key) || item.key.trim().toLowerCase() === configuredHeader) && credentialValueLooksUnsafe(item.value)) ||
    (/^(?:Bearer|Basic)\s+\S+/i.test(item.value.trim()) && credentialValueLooksUnsafe(item.value)),
  )) return true;
  if (config.queryParams.some((item) =>
    (isSensitiveKey(item.key) || item.key.trim().toLowerCase() === configuredQuery) && credentialValueLooksUnsafe(item.value),
  )) return true;
  return textContainsCredentials(config.requestTemplate) || textContainsCredentials(config.extraParameters);
}
