'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Boxes, Check, Download, FileUp, Plus, Save, Trash2, WandSparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useProfiles } from '@/hooks/use-workspace-data';
import { configFromPreset, PROVIDER_PRESETS } from '@/lib/llm/defaults';
import { configForStorage } from '@/lib/llm/privacy';
import type { ProviderConfig, SavedProfile } from '@/lib/llm/types';
import { providerConfigSchema } from '@/lib/llm/validation';
import { useAppStore } from '@/stores/app-store';

function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
}

function safeConfig(config: ProviderConfig) {
  return configForStorage(config);
}

export function ProvidersWorkspace() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const { profiles, loading, error, save, remove } = useProfiles();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [draft, setDraft] = useState(() => ({
    name: 'My company LLM', endpoint: 'https://llm.company.com/v1/chat', model: 'company-model-v2', authType: 'bearer' as ProviderConfig['authType'], authHeader: 'X-API-Key', queryKey: 'key', basicUsername: '', requestTemplate: '{\n  "model": "{{MODEL}}",\n  "query": "{{PROMPT}}"\n}', responsePath: 'result.answer',
  }));

  function useConfig(config: Omit<ProviderConfig, 'apiKey'>) {
    useAppStore.getState().setConfig({ ...structuredClone(config), apiKey: '' });
    router.push('/');
  }

  async function createProfile() {
    const base = configFromPreset('custom');
    const config: ProviderConfig = { ...base, ...draft, providerId: `custom-${crypto.randomUUID()}`, adapter: 'custom', requestMode: 'raw' };
    const now = new Date().toISOString();
    try {
      await save({ id: crypto.randomUUID(), name: draft.name, config: safeConfig(config), createdAt: now, updatedAt: now });
      setFeedback('Custom provider saved. Add its API key only when you use it.');
      setBuilderOpen(false);
    } catch (cause) { setFeedback(cause instanceof Error ? cause.message : 'Could not save provider.'); }
  }

  async function importProfile(file?: File) {
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text()) as unknown;
      const source = raw && typeof raw === 'object' && 'config' in raw ? (raw as { config: unknown }).config : raw;
      const parsed = providerConfigSchema.omit({ apiKey: true }).safeParse(source);
      if (!parsed.success) throw new Error('The file is not a valid OmniLLM configuration.');
      const now = new Date().toISOString();
      const profile: SavedProfile = {
        id: crypto.randomUUID(),
        name: raw && typeof raw === 'object' && 'name' in raw ? String((raw as { name: unknown }).name).slice(0, 100) : parsed.data.name,
        config: parsed.data,
        createdAt: now,
        updatedAt: now,
      };
      await save(profile);
      setFeedback('Configuration imported without credentials.');
    } catch (cause) { setFeedback(cause instanceof Error ? cause.message : 'Could not import configuration.'); }
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_65%_-12%,color-mix(in_oklch,var(--primary),transparent_92%),transparent_38%)]">
      <header className="border-b border-border/60 px-4 py-7 sm:px-8"><div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-primary"><Boxes className="size-4" /> Provider registry</div><h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">Presets when they help. Full control when they don’t.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Start from a known request shape or teach OmniLLM a completely new provider without changing code.</p></div><div className="flex gap-2"><input ref={inputRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void importProfile(event.target.files?.[0])} /><Button variant="outline" onClick={() => inputRef.current?.click()}><FileUp /> Import JSON</Button><Button onClick={() => setBuilderOpen((value) => !value)}><Plus /> New provider</Button></div></div></header>

      <div className="mx-auto max-w-7xl space-y-8 p-4 sm:p-8">
        {feedback && <div className="flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/8 px-4 py-3 text-xs"><Check className="size-4 text-primary" />{feedback}</div>}

        {builderOpen && <section className="rounded-2xl border border-primary/25 bg-card/60 p-5 shadow-xl"><div className="mb-5 flex items-center gap-3"><div className="grid size-9 place-items-center rounded-xl bg-primary/12 text-primary"><WandSparkles className="size-4" /></div><div><h2 className="text-sm font-semibold">Custom provider builder</h2><p className="text-[10px] text-muted-foreground">No code required. Secrets are intentionally not part of this form.</p></div></div><div className="grid gap-4 lg:grid-cols-2">
          <label className="space-y-2"><span className="text-[10px] text-muted-foreground">Provider name</span><Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="h-10 rounded-xl bg-background/40" /></label>
          <label className="space-y-2"><span className="text-[10px] text-muted-foreground">Model ID</span><Input value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} className="h-10 rounded-xl bg-background/40" /></label>
          <label className="space-y-2 lg:col-span-2"><span className="text-[10px] text-muted-foreground">Endpoint URL</span><Input value={draft.endpoint} onChange={(event) => setDraft({ ...draft, endpoint: event.target.value })} className="h-10 rounded-xl bg-background/40 font-mono text-xs" /></label>
          <label className="space-y-2"><span className="text-[10px] text-muted-foreground">Authentication</span><Select value={draft.authType} onValueChange={(value) => setDraft({ ...draft, authType: value as ProviderConfig['authType'] })}><SelectTrigger className="h-10 w-full rounded-xl bg-background/40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bearer">Bearer token</SelectItem><SelectItem value="api-key-header">API key header</SelectItem><SelectItem value="query">Query parameter</SelectItem><SelectItem value="basic">Basic auth</SelectItem><SelectItem value="custom-header">Custom header</SelectItem><SelectItem value="none">No auth</SelectItem></SelectContent></Select></label>
          {(draft.authType === 'api-key-header' || draft.authType === 'custom-header') && <label className="space-y-2"><span className="text-[10px] text-muted-foreground">Authentication header</span><Input value={draft.authHeader} onChange={(event) => setDraft({ ...draft, authHeader: event.target.value })} className="h-10 rounded-xl bg-background/40 font-mono text-xs" /></label>}
          {draft.authType === 'query' && <label className="space-y-2"><span className="text-[10px] text-muted-foreground">Authentication query parameter</span><Input value={draft.queryKey} onChange={(event) => setDraft({ ...draft, queryKey: event.target.value })} className="h-10 rounded-xl bg-background/40 font-mono text-xs" /></label>}
          {draft.authType === 'basic' && <label className="space-y-2"><span className="text-[10px] text-muted-foreground">Basic auth username</span><Input value={draft.basicUsername} onChange={(event) => setDraft({ ...draft, basicUsername: event.target.value })} className="h-10 rounded-xl bg-background/40 font-mono text-xs" /></label>}
          <label className="space-y-2"><span className="text-[10px] text-muted-foreground">Request template</span><Textarea value={draft.requestTemplate} onChange={(event) => setDraft({ ...draft, requestTemplate: event.target.value })} className="min-h-44 rounded-xl bg-black/20 font-mono text-[11px]" /></label>
          <label className="space-y-2"><span className="text-[10px] text-muted-foreground">Response text JSON path</span><Input value={draft.responsePath} onChange={(event) => setDraft({ ...draft, responsePath: event.target.value })} className="h-10 rounded-xl bg-background/40 font-mono text-xs" /><p className="text-[9px] text-muted-foreground">Example: result.answer</p></label>
        </div><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setBuilderOpen(false)}>Cancel</Button><Button onClick={() => void createProfile()}><Save /> Save provider</Button></div></section>}

        <section><div className="mb-4 flex items-center justify-between"><div><h2 className="text-sm font-semibold">Saved configurations</h2><p className="mt-1 text-[10px] text-muted-foreground">Stored in your private workspace; API keys are always omitted.</p></div><Badge variant="outline">{profiles.length}</Badge></div>{loading ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-32 rounded-2xl" />)}</div> : error ? <div className="rounded-2xl border border-destructive/30 bg-destructive/8 p-4 text-xs text-muted-foreground">{error}</div> : profiles.length === 0 ? <div className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-xs text-muted-foreground">No saved profiles yet. Save one from the connection panel or build one above.</div> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{profiles.map((profile) => <article key={profile.id} className="rounded-2xl border border-border/60 bg-card/45 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">{profile.name}</h3><p className="mt-1 font-mono text-[10px] text-muted-foreground">{profile.config.model}</p></div><Badge variant="secondary">Custom</Badge></div><p className="mt-3 truncate font-mono text-[10px] text-muted-foreground">{profile.config.endpoint}</p><div className="mt-4 flex gap-1"><Button size="sm" onClick={() => useConfig(profile.config)}>Use profile</Button><Button variant="ghost" size="icon-sm" onClick={() => downloadJson(`${profile.name.replace(/\W+/g, '-').toLowerCase()}.json`, profile)} aria-label="Export profile"><Download /></Button><Button variant="ghost" size="icon-sm" onClick={() => void remove(profile.id)} aria-label="Delete profile"><Trash2 /></Button></div></article>)}</div>}</section>

        <section><div className="mb-4 flex items-center justify-between"><div><h2 className="text-sm font-semibold">Provider presets</h2><p className="mt-1 text-[10px] text-muted-foreground">Endpoints and model IDs stay editable after selection.</p></div><Badge variant="outline">{PROVIDER_PRESETS.length} adapters & aliases</Badge></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{PROVIDER_PRESETS.map((preset) => <article key={preset.id} className="group rounded-2xl border border-border/60 bg-card/40 p-4 transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card/65"><div className="flex items-start gap-3"><span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: preset.color, boxShadow: `0 0 16px ${preset.color}55` }} /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{preset.name}</h3><Badge variant="outline" className="rounded-md text-[8px]">{preset.family}</Badge></div><p className="mt-2 min-h-10 text-[11px] leading-5 text-muted-foreground">{preset.description}</p><p className="mt-3 truncate font-mono text-[9px] text-muted-foreground">{preset.modelHint}</p><div className="mt-4 flex gap-2"><Button size="sm" onClick={() => useConfig(preset.config)}>Use preset</Button><Button variant="ghost" size="sm" onClick={() => downloadJson(`${preset.id}.json`, { name: preset.name, config: preset.config })}><Download /> Export</Button></div></div></div></article>)}</div></section>
      </div>
    </div>
  );
}
