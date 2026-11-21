'use client';

import { useCallback, useEffect, useState } from 'react';

import { workspaceFetch } from '@/lib/client/owner';
import type { RequestRecord, SavedProfile } from '@/lib/llm/types';

export function useHistory(query = '', provider = '') {
  const [records, setRecords] = useState<RequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (provider) params.set('provider', provider);
      const response = await workspaceFetch(`/api/history?${params}`);
      const data = (await response.json()) as { records?: RequestRecord[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Could not load history.');
      setRecords(data.records ?? []);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load history.');
    } finally {
      setLoading(false);
    }
  }, [provider, query]);
  useEffect(() => { void refresh(); }, [refresh]);
  const remove = useCallback(async (id: string) => {
    const response = await workspaceFetch(`/api/history?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Could not delete request.');
    setRecords((items) => items.filter((item) => item.id !== id));
  }, []);
  return { records, loading, error, refresh, remove };
}

export function useProfiles() {
  const [profiles, setProfiles] = useState<SavedProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await workspaceFetch('/api/profiles');
      const data = (await response.json()) as { profiles?: SavedProfile[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Could not load profiles.');
      setProfiles(data.profiles ?? []);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load profiles.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const save = useCallback(async (profile: SavedProfile) => {
    const response = await workspaceFetch('/api/profiles', { method: 'POST', body: JSON.stringify(profile) });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(data.error ?? 'Could not save profile.');
    await refresh();
  }, [refresh]);
  const remove = useCallback(async (id: string) => {
    const response = await workspaceFetch(`/api/profiles?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Could not delete profile.');
    setProfiles((items) => items.filter((item) => item.id !== id));
  }, []);
  return { profiles, loading, error, refresh, save, remove };
}

