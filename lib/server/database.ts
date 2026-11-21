import { env } from 'cloudflare:workers';

export function getDatabase(): D1Database {
  if (!env.DB) throw new Error('Database binding is unavailable.');
  return env.DB;
}

export async function enforceRateLimit(request: Request, limit = 60) {
  const address = request.headers.get('cf-connecting-ip') ?? 'local-preview';
  const userAgent = request.headers.get('user-agent')?.slice(0, 160) ?? '';
  const material = new TextEncoder().encode(`${address}|${userAgent}`);
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', material))]
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('');
  const now = Date.now();
  const hour = Math.floor(now / 3_600_000);
  const bucketKey = `${hash}:${hour}`;
  const expiresAt = (hour + 1) * 3_600_000;
  const db = getDatabase();

  const [, , result] = await db.batch([
    db.prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(now - 86_400_000),
    db.prepare(
      `INSERT INTO rate_limits (bucket_key, count, expires_at)
       VALUES (?, 1, ?)
       ON CONFLICT(bucket_key) DO UPDATE SET count = count + 1`,
    ).bind(bucketKey, expiresAt),
    db.prepare('SELECT count, expires_at FROM rate_limits WHERE bucket_key = ?').bind(bucketKey),
  ]);

  const row = result.results?.[0] as { count?: number; expires_at?: number } | undefined;
  const count = row?.count ?? limit + 1;
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt: row?.expires_at ?? expiresAt,
  };
}

export function ownerFromRequest(request: Request): string {
  const owner = request.headers.get('x-omnillm-owner') ?? '';
  if (!/^[A-Za-z0-9_-]{24,128}$/.test(owner)) throw new Error('A valid workspace token is required.');
  return owner;
}

