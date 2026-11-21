'use client';

import { useEffect, useState } from 'react';
import { Download, KeyRound, Moon, RotateCcw, Settings2, ShieldCheck, Sun, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { workspaceFetch } from '@/lib/client/owner';
import { configFromPreset } from '@/lib/llm/defaults';
import { useAppStore } from '@/stores/app-store';

function SettingRow({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-4 border-t border-border/50 py-4 first:border-0 first:pt-0 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="text-xs font-semibold">{title}</p><p className="mt-1 max-w-2xl text-[10px] leading-5 text-muted-foreground">{description}</p></div>{children}</div>;
}

export function SettingsWorkspace() {
  const config = useAppStore((state) => state.config);
  const patch = useAppStore((state) => state.patchConfig);
  const [theme, setThemeState] = useState<'dark' | 'light'>('dark');
  const [confirmClear, setConfirmClear] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => { setThemeState(document.documentElement.classList.contains('dark') ? 'dark' : 'light'); }, []);

  function setTheme(value: 'dark' | 'light') {
    setThemeState(value);
    window.dispatchEvent(new CustomEvent('omnillm:theme', { detail: value }));
  }

  async function exportWorkspace() {
    try {
      const [historyResponse, profileResponse] = await Promise.all([workspaceFetch('/api/history'), workspaceFetch('/api/profiles')]);
      if (!historyResponse.ok || !profileResponse.ok) throw new Error('Workspace data is unavailable.');
      const history = await historyResponse.json();
      const profiles = await profileResponse.json();
      const url = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), history, profiles }, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'omnillm-workspace.json'; link.click(); URL.revokeObjectURL(url);
      setFeedback('Workspace export created without API keys.');
    } catch { setFeedback('The workspace could not be exported.'); }
  }

  async function clearWorkspace() {
    if (!confirmClear) { setConfirmClear(true); return; }
    try {
      const responses = await Promise.all([
        workspaceFetch('/api/history?all=true', { method: 'DELETE' }),
        workspaceFetch('/api/profiles?all=true', { method: 'DELETE' }),
      ]);
      if (responses.some((response) => !response.ok)) throw new Error('One or more delete operations failed.');
      useAppStore.getState().setConfig(configFromPreset('mock'));
      useAppStore.getState().newChat();
      setFeedback('Saved profiles and history were deleted.');
    } catch { setFeedback('Saved data could not be deleted.'); }
    setConfirmClear(false);
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_55%_-15%,color-mix(in_oklch,var(--primary),transparent_93%),transparent_36%)]">
      <header className="border-b border-border/60 px-4 py-7 sm:px-8"><div className="mx-auto max-w-5xl"><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-primary"><Settings2 className="size-4" /> Settings</div><h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">Defaults, privacy, and local behavior.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Control the interface and request defaults. API keys remain session-only regardless of these settings.</p></div></header>
      <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-8">
        {feedback && <div className="rounded-xl border border-primary/25 bg-primary/8 px-4 py-3 text-xs">{feedback}</div>}
        <section className="rounded-2xl border border-border/60 bg-card/50 p-5"><div className="mb-5 flex items-center gap-3"><div className="grid size-9 place-items-center rounded-xl bg-primary/12 text-primary">{theme === 'dark' ? <Moon className="size-4" /> : <Sun className="size-4" />}</div><div><h2 className="text-sm font-semibold">Appearance</h2><p className="text-[10px] text-muted-foreground">Saved on this device.</p></div></div><SettingRow title="Color theme" description="Use the dark precision-workbench palette or a light, warm-neutral surface."><div className="flex rounded-xl border border-border/60 bg-background/35 p-1"><button onClick={() => setTheme('dark')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[10px] ${theme === 'dark' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}><Moon className="size-3.5" /> Dark</button><button onClick={() => setTheme('light')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[10px] ${theme === 'light' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}><Sun className="size-3.5" /> Light</button></div></SettingRow></section>

        <section className="rounded-2xl border border-border/60 bg-card/50 p-5"><div className="mb-5 flex items-center gap-3"><div className="grid size-9 place-items-center rounded-xl bg-primary/12 text-primary"><RotateCcw className="size-4" /></div><div><h2 className="text-sm font-semibold">Request defaults</h2><p className="text-[10px] text-muted-foreground">Applied to the active playground configuration.</p></div></div><SettingRow title="Streaming responses" description="Request server-sent events and render tokens progressively; standard responses remain supported as a fallback."><Switch checked={config.streaming} onCheckedChange={(checked) => patch({ streaming: checked })} /></SettingRow><SettingRow title="Direct / Local mode" description="Send from the browser for localhost APIs such as Ollama or LM Studio. This exposes the key to the selected endpoint and depends on CORS."><Switch checked={config.directMode} onCheckedChange={(checked) => patch({ directMode: checked })} /></SettingRow><SettingRow title="Request timeout" description="The hosted proxy aborts upstream work after this many milliseconds (1,000–120,000)."><Input type="number" min="1000" max="120000" step="1000" value={config.timeoutMs} onChange={(event) => patch({ timeoutMs: Number(event.target.value) })} className="h-9 w-36 rounded-xl bg-background/35" /></SettingRow></section>

        <section className="rounded-2xl border border-border/60 bg-card/50 p-5"><div className="mb-5 flex items-center gap-3"><div className="grid size-9 place-items-center rounded-xl bg-emerald-400/12 text-emerald-500"><ShieldCheck className="size-4" /></div><div><h2 className="text-sm font-semibold">Privacy & security</h2><p className="text-[10px] text-muted-foreground">Security boundaries that stay on.</p></div></div><div className="grid gap-3 md:grid-cols-3">{[['Request-only keys', 'Keys are never written to profiles, history, exports, analytics, or logs.'], ['SSRF guard', 'Hosted requests require HTTPS and block internal targets and cross-host redirects.'], ['Bounded traffic', 'Requests, responses, timeouts, headers, and per-client rates are capped.']].map(([title, text]) => <div key={title} className="rounded-xl border border-border/55 bg-background/25 p-4"><KeyRound className="size-4 text-primary" /><p className="mt-3 text-xs font-semibold">{title}</p><p className="mt-2 text-[10px] leading-5 text-muted-foreground">{text}</p></div>)}</div></section>

        <section className="rounded-2xl border border-border/60 bg-card/50 p-5"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-sm font-semibold">Workspace data</h2><p className="mt-1 text-[10px] text-muted-foreground">Profiles and redacted history are scoped to this browser’s private workspace token.</p></div><Badge variant="outline">No API keys</Badge></div><SettingRow title="Export workspace" description="Download saved profiles and request history as one JSON file. Credentials are not part of the stored records."><Button variant="outline" onClick={() => void exportWorkspace()}><Download /> Export JSON</Button></SettingRow><SettingRow title="Delete saved data" description="Permanently remove this workspace’s provider profiles and request history. Your local theme preference remains."><Button variant={confirmClear ? 'destructive' : 'outline'} onClick={() => void clearWorkspace()}>{confirmClear ? <Trash2 /> : <Trash2 />}{confirmClear ? 'Confirm delete' : 'Clear saved data'}</Button></SettingRow></section>
      </div>
    </div>
  );
}
