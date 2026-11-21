import { NextResponse } from 'next/server';
import { z } from 'zod';

import { redactSecrets } from '@/lib/llm/errors';
import { chatMessageSchema } from '@/lib/llm/validation';
import { getDatabase, ownerFromRequest } from '@/lib/server/database';

export const runtime = 'edge';

const requestPreviewSchema = z.object({
  url: z.string().max(4096),
  method: z.enum(['POST', 'GET', 'PUT']),
  headers: z.record(z.string(), z.string().max(8000)),
  body: z.unknown(),
}).optional();

const recordSchema = z.object({
  id: z.string().min(1).max(200),
  conversationId: z.string().min(1).max(200),
  provider: z.string().min(1).max(100),
  model: z.string().max(300),
  messages: z.array(chatMessageSchema).max(200),
  responseText: z.string().max(500_000),
  statusCode: z.number().int().min(0).max(999),
  latencyMs: z.number().int().min(0).max(3_600_000),
  usage: z.object({
    inputTokens: z.number().optional(),
    outputTokens: z.number().optional(),
    totalTokens: z.number().optional(),
  }).optional(),
  request: requestPreviewSchema,
  response: z.unknown().optional(),
  createdAt: z.string().datetime(),
});

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function safeParseJson(value: unknown) {
  if (typeof value !== 'string' || !value) return undefined;
  try { return JSON.parse(value); } catch { return undefined; }
}

function rowToRecord(row: Record<string, unknown>) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    provider: row.provider,
    model: row.model,
    messages: safeParseJson(row.messages_json) ?? [],
    responseText: row.response_text,
    statusCode: row.status_code,
    latencyMs: row.latency_ms,
    usage: safeParseJson(row.usage_json),
    request: safeParseJson(row.request_json),
    response: safeParseJson(row.response_json),
    createdAt: row.created_at,
  };
}

export async function GET(request: Request) {
  try {
    const owner = ownerFromRequest(request);
    const url = new URL(request.url);
    const query = (url.searchParams.get('q') ?? '').slice(0, 200).trim();
    const provider = (url.searchParams.get('provider') ?? '').slice(0, 100).trim();
    const db = getDatabase();
    let statement: D1PreparedStatement;
    if (query && provider) {
      const like = `%${query}%`;
      statement = db.prepare(
        `SELECT * FROM request_history
         WHERE owner_id = ? AND provider = ?
           AND (model LIKE ? OR response_text LIKE ? OR messages_json LIKE ?)
         ORDER BY created_at DESC LIMIT 200`,
      ).bind(owner, provider, like, like, like);
    } else if (query) {
      const like = `%${query}%`;
      statement = db.prepare(
        `SELECT * FROM request_history
         WHERE owner_id = ?
           AND (provider LIKE ? OR model LIKE ? OR response_text LIKE ? OR messages_json LIKE ?)
         ORDER BY created_at DESC LIMIT 200`,
      ).bind(owner, like, like, like, like);
    } else if (provider) {
      statement = db.prepare(
        'SELECT * FROM request_history WHERE owner_id = ? AND provider = ? ORDER BY created_at DESC LIMIT 200',
      ).bind(owner, provider);
    } else {
      statement = db.prepare(
        'SELECT * FROM request_history WHERE owner_id = ? ORDER BY created_at DESC LIMIT 200',
      ).bind(owner);
    }
    const result = await statement.all<Record<string, unknown>>();
    return json({ records: (result.results ?? []).map(rowToRecord) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not load history.' }, 400);
  }
}

export async function POST(request: Request) {
  try {
    const owner = ownerFromRequest(request);
    const parsed = recordSchema.safeParse(await request.json());
    if (!parsed.success) return json({ error: 'History record is invalid.' }, 400);
    const safe = redactSecrets(parsed.data) as typeof parsed.data;
    const db = getDatabase();
    await db.prepare(
      `INSERT INTO request_history
       (id, owner_id, conversation_id, provider, model, messages_json, response_text,
        status_code, latency_ms, usage_json, request_json, response_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      safe.id,
      owner,
      safe.conversationId,
      safe.provider,
      safe.model,
      JSON.stringify(safe.messages).slice(0, 750_000),
      safe.responseText.slice(0, 500_000),
      safe.statusCode,
      safe.latencyMs,
      safe.usage ? JSON.stringify(safe.usage) : null,
      safe.request ? JSON.stringify(safe.request).slice(0, 300_000) : null,
      safe.response !== undefined ? JSON.stringify(safe.response).slice(0, 500_000) : null,
      safe.createdAt,
    ).run();
    return json({ saved: true, id: safe.id }, 201);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not save history.' }, 400);
  }
}

export async function DELETE(request: Request) {
  try {
    const owner = ownerFromRequest(request);
    const url = new URL(request.url);
    if (url.searchParams.get('all') === 'true') {
      await getDatabase().prepare('DELETE FROM request_history WHERE owner_id = ?').bind(owner).run();
      return json({ deleted: true, scope: 'all' });
    }
    const id = url.searchParams.get('id') ?? '';
    if (!/^[A-Za-z0-9_-]{8,200}$/.test(id)) return json({ error: 'A valid record id is required.' }, 400);
    await getDatabase().prepare('DELETE FROM request_history WHERE id = ? AND owner_id = ?').bind(id, owner).run();
    return json({ deleted: true, id });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not delete history.' }, 400);
  }
}
