'use client';

import { useRef, useState } from 'react';
import { CirclePlus, Eye, EyeOff, Gauge, Play, Send, Square, Trash2, Waypoints } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { executeLLM } from '@/lib/client/llm-client';
import { configFromPreset, PROVIDER_PRESETS } from '@/lib/llm/defaults';
import type { NormalizedLLMResponse, ProviderConfig } from '@/lib/llm/types';

type Target = { id: string; config: ProviderConfig; result?: NormalizedLLMResponse; error?: string; running?: boolean };

function newTarget(presetId = 'mock', suffix = ''): Target {
  const config = configFromPreset(presetId);
  if (suffix) { config.name = `${config.name} · ${suffix}`; config.model = `mock-${suffix.toLowerCase()}`; }
  return { id: crypto.randomUUID(), config };
}

export function CompareWorkspace() {
  const [targets, setTargets] = useState<Target[]>(() => [newTarget('mock', 'Fast'), newTarget('mock', 'Detailed')]);
  const [prompt, setPrompt] = useState('Explain the tradeoff between latency and response quality in three concise bullets.');
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  function patchTarget(id: string, patch: Partial<ProviderConfig>) {
    setTargets((items) => items.map((item) => item.id === id ? { ...item, config: { ...item.config, ...patch } } : item));
  }

  function selectProvider(id: string, providerId: string) {
    setTargets((items) => items.map((item) => item.id === id ? { ...item, config: configFromPreset(providerId), result: undefined, error: undefined } : item));
  }

  async function run() {
    if (!prompt.trim() || !targets.length || running) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setTargets((items) => items.map((item) => ({ ...item, running: true, result: undefined, error: undefined })));
    await Promise.allSettled(targets.map(async (target) => {
      try {
        let streamed = '';
        const { response } = await executeLLM({
          config: target.config,
          messages: [{ id: crypto.randomUUID(), role: 'user', content: prompt, createdAt: new Date().toISOString() }],
        }, controller.signal, (delta) => {
          streamed += delta;
          setTargets((items) => items.map((item) => item.id === target.id ? { ...item, result: {
            provider: target.config.name, model: target.config.model, content: streamed, statusCode: 200, latencyMs: 0, raw: { streaming: true },
          } } : item));
        });
        setTargets((items) => items.map((item) => item.id === target.id ? { ...item, running: false, result: response } : item));
      } catch (error) {
        const detail = error && typeof error === 'object' ? error as Record<string, unknown> : undefined;
        setTargets((items) => items.map((item) => item.id === target.id ? { ...item, running: false, error: String(detail?.message ?? (error instanceof Error ? error.message : 'Request failed.')) } : item));
      }
    }));
    abortRef.current = null;
    setRunning(false);
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_40%_-10%,color-mix(in_oklch,var(--primary),transparent_92%),transparent_36%)]">
      <header className="border-b border-border/60 px-4 py-7 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4">
          <div><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-primary"><Waypoints className="size-4" /> Compare mode</div><h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">One prompt, side-by-side evidence.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Run up to four providers in parallel. Credentials remain in memory and each result keeps its own latency, token, and status metrics.</p></div>
          <Badge variant="outline" className="rounded-xl px-3 py-1.5">{targets.length} of 4 providers</Badge>
        </div>
      </header>

      <div className="mx-auto max-w-7xl p-4 sm:p-8">
        <div className="rounded-2xl border border-border/65 bg-card/55 p-2 shadow-lg">
          <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} className="min-h-24 resize-y border-0 bg-transparent px-3 py-3 focus-visible:ring-0" placeholder="Enter one prompt for every provider…" />
          <div className="flex items-center gap-2 px-1 pb-1">
            <Button variant="ghost" size="sm" onClick={() => setPrompt('')}>Clear</Button>
            <span className="hidden text-[10px] text-muted-foreground sm:inline">Requests run concurrently and fail independently.</span>
            {running ? <Button variant="destructive" className="ml-auto" onClick={() => abortRef.current?.abort()}><Square /> Stop all</Button> : <Button className="ml-auto" onClick={() => void run()} disabled={!prompt.trim()}><Send /> Run comparison</Button>}
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {targets.map((target, index) => (
            <article key={target.id} className="overflow-hidden rounded-2xl border border-border/65 bg-card/45">
              <div className="flex items-center gap-3 border-b border-border/60 p-4">
                <div className="grid size-8 place-items-center rounded-xl bg-primary/12 text-xs font-bold text-primary">{String.fromCharCode(65 + index)}</div>
                <Select value={target.config.providerId} onValueChange={(value) => selectProvider(target.id, String(value))}>
                  <SelectTrigger className="h-9 min-w-0 flex-1 rounded-xl border-border/60 bg-background/35"><SelectValue /></SelectTrigger>
                  <SelectContent>{PROVIDER_PRESETS.map((preset) => <SelectItem key={preset.id} value={preset.id}>{preset.name}</SelectItem>)}</SelectContent>
                </Select>
                <Button variant="ghost" size="icon" onClick={() => setTargets((items) => items.filter((item) => item.id !== target.id))} disabled={targets.length === 1} aria-label="Remove provider"><Trash2 /></Button>
              </div>
              <div className="grid gap-3 border-b border-border/50 bg-background/20 p-4 sm:grid-cols-2">
                <label className="space-y-1.5"><span className="text-[10px] text-muted-foreground">Model ID</span><Input value={target.config.model} onChange={(event) => patchTarget(target.id, { model: event.target.value })} className="h-9 rounded-xl bg-background/40" /></label>
                <label className="space-y-1.5"><span className="text-[10px] text-muted-foreground">API key · session only</span><div className="relative"><Input type={showKeys[target.id] ? 'text' : 'password'} value={target.config.apiKey} onChange={(event) => patchTarget(target.id, { apiKey: event.target.value })} disabled={target.config.authType === 'none'} placeholder={target.config.authType === 'none' ? 'Not required' : 'Enter key'} className="h-9 rounded-xl bg-background/40 pr-9" /><button type="button" onClick={() => setShowKeys((items) => ({ ...items, [target.id]: !items[target.id] }))} className="absolute right-2.5 top-2.5 text-muted-foreground" aria-label="Toggle key visibility">{showKeys[target.id] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></label>
                {target.config.providerId !== 'mock' && <label className="space-y-1.5 sm:col-span-2"><span className="text-[10px] text-muted-foreground">Endpoint</span><Input value={target.config.endpoint} onChange={(event) => patchTarget(target.id, { endpoint: event.target.value })} className="h-9 rounded-xl bg-background/40 font-mono text-[11px]" /></label>}
              </div>
              <div className="min-h-56 p-4">
                {target.running && !target.result && <div className="flex h-40 flex-col items-center justify-center gap-3 text-muted-foreground"><span className="size-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" /><span className="text-xs">Waiting for {target.config.name}…</span></div>}
                {!target.running && !target.result && !target.error && <div className="flex h-40 flex-col items-center justify-center gap-3 text-center text-muted-foreground"><Play className="size-5" /><p className="max-w-xs text-xs leading-5">Ready. The response and metrics will appear here.</p></div>}
                {target.error && <div className="rounded-xl border border-destructive/30 bg-destructive/8 p-4"><p className="text-xs font-semibold text-destructive">Request failed</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{target.error}</p></div>}
                {target.result && <div><p className="whitespace-pre-wrap text-sm leading-6">{target.result.content}</p><div className="mt-5 grid grid-cols-4 gap-2 border-t border-border/50 pt-4">{[['Status', target.result.statusCode], ['Latency', target.result.latencyMs ? `${target.result.latencyMs} ms` : 'Streaming'], ['Tokens', target.result.usage?.totalTokens ?? '—'], ['Length', `${target.result.content.length}`]].map(([label, value]) => <div key={label} className="rounded-xl bg-background/35 p-2"><p className="text-[8px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-[11px] font-semibold">{value}</p></div>)}</div></div>}
              </div>
            </article>
          ))}
          {targets.length < 4 && <button type="button" onClick={() => setTargets((items) => [...items, newTarget('mock', `Variant ${items.length + 1}`)])} className="flex min-h-44 items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 text-sm text-muted-foreground transition hover:border-primary/40 hover:bg-primary/[0.03] hover:text-primary"><CirclePlus className="size-4" /> Add provider</button>}
        </div>
        <div className="mt-5 flex items-center gap-2 text-[10px] text-muted-foreground"><Gauge className="size-3.5 text-primary" /> Cost appears only when reliable pricing metadata exists; no price is inferred.</div>
      </div>
    </div>
  );
}

