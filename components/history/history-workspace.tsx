'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock3, Download, FileJson, History, RefreshCw, Search, Trash2, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useHistory } from '@/hooks/use-workspace-data';
import { PROVIDER_PRESETS } from '@/lib/llm/defaults';
import type { RequestRecord } from '@/lib/llm/types';
import { useAppStore } from '@/stores/app-store';

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
}

function JsonDetails({ record }: { record: RequestRecord }) {
  return (
    <div className="grid gap-4 border-t border-border/60 bg-black/10 p-4 lg:grid-cols-2">
      <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Redacted request</p><pre className="max-h-64 overflow-auto rounded-xl bg-black/25 p-3 font-mono text-[10px] leading-5 whitespace-pre-wrap">{JSON.stringify(record.request, null, 2)}</pre></div>
      <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Raw response</p><pre className="max-h-64 overflow-auto rounded-xl bg-black/25 p-3 font-mono text-[10px] leading-5 whitespace-pre-wrap">{JSON.stringify(record.response, null, 2)}</pre></div>
    </div>
  );
}

export function HistoryWorkspace() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [provider, setProvider] = useState('all');
  const [expanded, setExpanded] = useState<string>();
  const { records, loading, error, remove } = useHistory(search, provider === 'all' ? '' : provider);
  const providerNames = useMemo(() => [...new Set(records.map((item) => item.provider))], [records]);

  function reusePrompt(record: RequestRecord) {
    const lastUserIndex = record.messages.findLastIndex((message) => message.role === 'user');
    const previousMessages = lastUserIndex > 0 ? record.messages.slice(0, lastUserIndex) : [];
    useAppStore.getState().setMessages(previousMessages);
    const preset = PROVIDER_PRESETS.find((item) => item.name === record.provider || record.provider.startsWith(item.name));
    if (preset) useAppStore.getState().selectPreset(preset.id);
    const lastUser = lastUserIndex >= 0 ? record.messages[lastUserIndex] : undefined;
    if (lastUser) window.sessionStorage.setItem('omnillm.reuse-prompt', lastUser.content);
    router.push('/');
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_20%_-15%,color-mix(in_oklch,var(--primary),transparent_93%),transparent_34%)]">
      <header className="border-b border-border/60 px-4 py-7 sm:px-8">
        <div className="mx-auto max-w-6xl"><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-primary"><History className="size-4" /> Durable request history</div><h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">Every result, minus the secrets.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Search previous prompts and responses, inspect redacted traffic, reuse a prompt safely, or export an individual record.</p></div>
      </header>
      <div className="mx-auto max-w-6xl p-4 sm:p-8">
        <div className="grid gap-3 rounded-2xl border border-border/60 bg-card/45 p-3 sm:grid-cols-[1fr_220px_auto]">
          <label className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search prompt, response, model…" className="h-10 rounded-xl bg-background/35 pl-9" /></label>
          <Select value={provider} onValueChange={(value) => setProvider(String(value))}><SelectTrigger className="h-10 w-full rounded-xl bg-background/35"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All providers</SelectItem>{providerNames.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select>
          <Badge variant="outline" className="h-10 justify-center rounded-xl px-4">{records.length} records</Badge>
        </div>

        <div className="mt-5 space-y-3">
          {loading && [0, 1, 2].map((item) => <Skeleton key={item} className="h-28 rounded-2xl" />)}
          {error && <div className="rounded-2xl border border-destructive/30 bg-destructive/8 p-5"><p className="text-sm font-semibold text-destructive">History is unavailable</p><p className="mt-2 text-xs text-muted-foreground">{error}</p></div>}
          {!loading && !error && records.length === 0 && <div className="rounded-2xl border border-dashed border-border/70 p-12 text-center"><History className="mx-auto size-6 text-muted-foreground" /><p className="mt-4 text-sm font-semibold">No matching requests</p><p className="mt-2 text-xs text-muted-foreground">Send a prompt in the playground and its redacted record will appear here.</p><Button className="mt-5" onClick={() => router.push('/')}>Open playground</Button></div>}
          {records.map((record) => {
            const prompt = [...record.messages].reverse().find((message) => message.role === 'user')?.content ?? 'Untitled request';
            return (
              <article key={record.id} className="overflow-hidden rounded-2xl border border-border/60 bg-card/45">
                <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <button type="button" onClick={() => setExpanded(expanded === record.id ? undefined : record.id)} className="min-w-0 text-left">
                    <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary" className="rounded-md">{record.provider}</Badge><span className="font-mono text-[10px] text-muted-foreground">{record.model}</span>{record.statusCode < 400 ? <CheckCircle2 className="size-3.5 text-emerald-500" /> : <XCircle className="size-3.5 text-destructive" />}</div>
                    <p className="mt-3 truncate text-sm font-medium">{prompt}</p><p className="mt-1 truncate text-xs text-muted-foreground">{record.responseText}</p>
                  </button>
                  <div className="flex flex-wrap items-center gap-1"><span className="mr-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Clock3 className="size-3" />{record.latencyMs} ms</span><Button variant="ghost" size="sm" onClick={() => reusePrompt(record)}><RefreshCw /> Reuse prompt</Button><Button variant="ghost" size="icon" onClick={() => download(`omnillm-${record.id}.json`, JSON.stringify(record, null, 2), 'application/json')} aria-label="Export JSON"><FileJson /></Button><Button variant="ghost" size="icon" onClick={() => download(`omnillm-${record.id}.md`, `# ${prompt}\n\n${record.responseText}`, 'text/markdown')} aria-label="Export Markdown"><Download /></Button><Button variant="ghost" size="icon" onClick={() => void remove(record.id)} aria-label="Delete history record"><Trash2 /></Button></div>
                </div>
                {expanded === record.id && <JsonDetails record={record} />}
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
