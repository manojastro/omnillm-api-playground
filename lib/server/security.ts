const forbiddenHeaders = new Set([
  'connection',
  'content-length',
  'cookie',
  'forwarded',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
]);

function parseIpv4(hostname: string): number[] | null {
  const parts = hostname.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return null;
  const numbers = parts.map(Number);
  return numbers.every((part) => part >= 0 && part <= 255) ? numbers : null;
}

function isPrivateIpv4(parts: number[]) {
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function assertSafeUpstreamUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter a valid endpoint URL.');
  }
  if (url.protocol !== 'https:') throw new Error('Hosted proxy requests require an HTTPS endpoint. Use Direct / Local mode for localhost.');
  if (url.username || url.password) throw new Error('Credentials in endpoint URLs are not allowed.');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const ipv4 = parseIpv4(host);
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.home') ||
    host === 'metadata.google.internal' ||
    host === '169.254.169.254' ||
    (ipv4 && isPrivateIpv4(ipv4)) ||
    host === '::1' ||
    host === '::' ||
    host.startsWith('::ffff:') ||
    /^f[cd][0-9a-f]:/i.test(host) ||
    /^fe[89ab][0-9a-f]:/i.test(host)
  ) {
    throw new Error('Private and internal network endpoints are blocked by the hosted proxy.');
  }
  return url;
}

export function sanitizeUpstreamHeaders(headers: Record<string, string>) {
  const safe = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    const normalized = key.toLowerCase().trim();
    if (!normalized || forbiddenHeaders.has(normalized) || normalized.startsWith('sec-')) continue;
    if (/[^!#$%&'*+.^_`|~0-9a-z-]/i.test(normalized)) continue;
    safe.set(key, value.replace(/[\r\n]/g, ''));
  }
  return safe;
}

export function safeResponseHeaders(headers: Headers) {
  const allowed = new Set(['content-type', 'date', 'server', 'x-request-id', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset']);
  return Object.fromEntries(
    [...headers.entries()].filter(([key]) => allowed.has(key.toLowerCase())).slice(0, 30),
  );
}

export async function fetchWithSafeRedirects(
  built: { url: string; method: string; headers: Record<string, string>; body?: string },
  signal: AbortSignal,
) {
  let url = assertSafeUpstreamUrl(built.url);
  const originalHost = url.host;
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const response = await fetch(url, {
      method: built.method,
      headers: sanitizeUpstreamHeaders(built.headers),
      body: built.method === 'GET' ? undefined : built.body,
      redirect: 'manual',
      signal,
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (!location) return response;
    const next = assertSafeUpstreamUrl(new URL(location, url).toString());
    if (next.host !== originalHost) throw new Error('Cross-host redirects are blocked to protect request credentials.');
    url = next;
  }
  throw new Error('The endpoint redirected too many times.');
}
