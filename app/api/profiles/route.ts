import { NextResponse } from 'next/server';
import { z } from 'zod';

import { providerConfigSchema } from '@/lib/llm/validation';
import { profileContainsCredentials } from '@/lib/llm/privacy';
import { getDatabase, ownerFromRequest } from '@/lib/server/database';

export const runtime = 'edge';

const profileSchema = z.object({
  id: z.string().min(8).max(200),
  name: z.string().min(1).max(100),
  config: providerConfigSchema.omit({ apiKey: true }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function rowToProfile(row: Record<string, unknown>) {
  let config: unknown = {};
  try { config = JSON.parse(String(row.config_json)); } catch { /* invalid rows stay harmless */ }
  return {
    id: row.id,
    name: row.name,
    config,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(request: Request) {
  try {
    const owner = ownerFromRequest(request);
    const result = await getDatabase()
      .prepare('SELECT * FROM provider_profiles WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 100')
      .bind(owner)
      .all<Record<string, unknown>>();
    return json({ profiles: (result.results ?? []).map(rowToProfile) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not load profiles.' }, 400);
  }
}

export async function POST(request: Request) {
  try {
    const owner = ownerFromRequest(request);
    const parsed = profileSchema.safeParse(await request.json());
    if (!parsed.success) return json({ error: 'Provider profile is invalid.', fields: parsed.error.flatten().fieldErrors }, 400);
    const profile = parsed.data;
    if (profileContainsCredentials(profile.config)) {
      return json({ error: 'Replace credentials in endpoints, headers, query parameters, and JSON bodies with {{API_KEY}} before saving.' }, 400);
    }
    const configJson = JSON.stringify(profile.config);
    await getDatabase().prepare(
      `INSERT INTO provider_profiles (id, owner_id, name, provider_id, config_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         provider_id = excluded.provider_id,
         config_json = excluded.config_json,
         updated_at = excluded.updated_at
       WHERE owner_id = excluded.owner_id`,
    ).bind(
      profile.id,
      owner,
      profile.name,
      profile.config.providerId,
      configJson,
      profile.createdAt,
      profile.updatedAt,
    ).run();
    return json({ saved: true, profile }, 201);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not save profile.' }, 400);
  }
}

export async function DELETE(request: Request) {
  try {
    const owner = ownerFromRequest(request);
    const url = new URL(request.url);
    if (url.searchParams.get('all') === 'true') {
      await getDatabase().prepare('DELETE FROM provider_profiles WHERE owner_id = ?').bind(owner).run();
      return json({ deleted: true, scope: 'all' });
    }
    const id = url.searchParams.get('id') ?? '';
    if (!/^[A-Za-z0-9_-]{8,200}$/.test(id)) return json({ error: 'A valid profile id is required.' }, 400);
    await getDatabase().prepare('DELETE FROM provider_profiles WHERE id = ? AND owner_id = ?').bind(id, owner).run();
    return json({ deleted: true, id });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not delete profile.' }, 400);
  }
}
