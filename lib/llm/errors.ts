export type NormalizedError = {
  title: string;
  message: string;
  statusCode: number;
  code: string;
  technicalDetails?: unknown;
};

export function normalizeError(statusCode: number, raw?: unknown): NormalizedError {
  const table: Record<number, [string, string, string]> = {
    400: ['Invalid request', 'The provider rejected the request payload.', 'invalid_request'],
    401: ['Authentication failed', 'Check the API key and authentication method.', 'authentication_failed'],
    403: ['Access denied', 'This key does not have access to the selected model or endpoint.', 'access_denied'],
    404: ['Endpoint not found', 'Check the endpoint URL and model identifier.', 'not_found'],
    408: ['Request timed out', 'The provider took too long to respond.', 'timeout'],
    413: ['Request too large', 'Reduce the prompt or request template size.', 'request_too_large'],
    429: ['Rate limited', 'The provider quota or playground request limit was reached.', 'rate_limited'],
  };
  const fallback: [string, string, string] = statusCode >= 500
    ? ['Provider server error', 'The upstream provider returned a server error.', 'provider_error']
    : ['Request failed', 'The API request could not be completed.', 'request_failed'];
  const [title, message, code] = table[statusCode] ?? fallback;
  return { title, message, statusCode, code, technicalDetails: raw };
}

export function isSensitiveKey(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  if (/^(?:x[-_])?(?:authorization|proxy[-_]?authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|auth[-_]?token|secret|client[-_]?secret|password|credential|credentials|cookie|set[-_]?cookie)$/i.test(normalized)) return true;
  const segments = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  return segments.some((segment) => ['key', 'auth', 'token', 'credential', 'credentials', 'secret', 'password'].includes(segment));
}

export function redactSecrets(value: unknown, secrets: string[] = []): unknown {
  const scrub = (text: string) => {
    let output = text.replace(/(bearer\s+)[^\s"']+/gi, '$1••••••••');
    output = output.replace(/((?:^|[,{;\s])["']?(?:authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|auth[-_]?token|secret|client[-_]?secret|password|credential|credentials)["']?\s*[:=]\s*["']?)[^"',\s}]+/gim, '$1••••••••');
    for (const secret of secrets.filter(Boolean)) output = output.split(secret).join('••••••••');
    return output;
  };
  if (typeof value === 'string') return scrub(value);
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, secrets));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      isSensitiveKey(key)
        ? '••••••••'
        : redactSecrets(item, secrets),
    ]));
  }
  return value;
}
