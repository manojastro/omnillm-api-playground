'use client';

import { useMemo, useState } from 'react';
import {
  Braces,
  CirclePlus,
  Eye,
  EyeOff,
  FlaskConical,
  KeyRound,
  Play,
  Save,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useProfiles } from '@/hooks/use-workspace-data';
import { PROVIDER_PRESETS } from '@/lib/llm/defaults';
import { configForStorage } from '@/lib/llm/privacy';
import type { KeyValue } from '@/lib/llm/types';
import { useAppStore } from '@/stores/app-store';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
        {hint && <span className="text-[9px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function KeyValueEditor({
  label,
  items,
  onChange,
  keyPlaceholder,
}: {
  label: string;
  items: KeyValue[];
  onChange: (items: KeyValue[]) => void;
  keyPlaceholder: string;
}) {
  return (
    <Field label={label} hint={`${items.length} configured`}>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="grid grid-cols-[minmax(0,.8fr)_minmax(0,1fr)_32px] gap-2">
            <Input
              aria-label={`${label} key`}
              value={item.key}
              placeholder={keyPlaceholder}
              onChange={(event) => onChange(items.map((row) => row.id === item.id ? { ...row, key: event.target.value } : row))}
              className="h-9 rounded-xl border-border/70 bg-background/50 font-mono text-[11px]"
            />
            <Input
              aria-label={`${label} value`}
              value={item.value}
              placeholder="Value or {{VARIABLE}}"
              onChange={(event) => onChange(items.map((row) => row.id === item.id ? { ...row, value: event.target.value } : row))}
              className="h-9 rounded-xl border-border/70 bg-background/50 font-mono text-[11px]"
            />
            <Button variant="ghost" size="icon" aria-label={`Remove ${label} row`} onClick={() => onChange(items.filter((row) => row.id !== item.id))}>
              <Trash2 className="text-muted-foreground" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="w-full border-dashed bg-transparent"
          onClick={() => onChange([...items, { id: crypto.randomUUID(), key: '', value: '' }])}
        >
          <CirclePlus /> Add row
        </Button>
      </div>
    </Field>
  );
}

export function ConnectionPanel({
  onTest,
  testState,
  compact = false,
  onClose,
}: {
  onTest: () => Promise<void>;
  testState: { status: 'idle' | 'testing' | 'success' | 'error'; message?: string; latency?: number };
  compact?: boolean;
  onClose?: () => void;
}) {
  const config = useAppStore((state) => state.config);
  const patch = useAppStore((state) => state.patchConfig);
  const selectPreset = useAppStore((state) => state.selectPreset);
  const { save } = useProfiles();
  const [showKey, setShowKey] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const preset = useMemo(() => PROVIDER_PRESETS.find((item) => item.id === config.providerId), [config.providerId]);

  async function saveProfile() {
    const now = new Date().toISOString();
    const safeConfig = configForStorage(config);
    try {
      await save({
        id: crypto.randomUUID(),
        name: profileName.trim() || `${config.name} profile`,
        config: safeConfig,
        createdAt: now,
        updatedAt: now,
      });
      setSaveStatus('Saved without the API key.');
      setProfileName('');
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : 'Could not save profile.');
    }
  }

  return (
    <aside className={`flex min-h-0 flex-col bg-sidebar ${compact ? 'h-full' : 'h-[calc(100vh-0px)] border-l border-border/60'}`}>
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-border/60 px-5">
        <div>
          <p className="text-sm font-semibold">Connection</p>
          <p className="text-[10px] text-muted-foreground">Request-scoped credentials</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`rounded-lg ${testState.status === 'success' ? 'border-emerald-400/25 bg-emerald-400/8 text-emerald-500' : 'border-border/70 text-muted-foreground'}`}>
            {testState.status === 'testing' ? 'Testing…' : testState.status === 'success' ? 'Connected' : testState.status === 'error' ? 'Check failed' : 'Ready'}
          </Badge>
          {onClose && <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close configuration"><X /></Button>}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <Field label="Provider">
          <Select value={config.providerId} onValueChange={(value) => selectPreset(String(value))}>
            <SelectTrigger className="h-10 w-full rounded-xl border-border/70 bg-background/40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDER_PRESETS.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {preset && <p className="text-[10px] leading-4 text-muted-foreground">{preset.description}</p>}
        </Field>

        <Tabs defaultValue="connection" className="mt-5">
          <TabsList className="grid w-full grid-cols-3 bg-background/45">
            <TabsTrigger value="connection">Connect</TabsTrigger>
            <TabsTrigger value="request">Request</TabsTrigger>
            <TabsTrigger value="parameters">Params</TabsTrigger>
          </TabsList>

          <TabsContent value="connection" className="mt-5 space-y-5">
            <Field label="Endpoint URL" hint={config.directMode ? 'Browser → API' : 'Secure proxy'}>
              <Input value={config.endpoint} onChange={(event) => patch({ endpoint: event.target.value })} className="h-10 rounded-xl border-border/70 bg-background/40 font-mono text-[11px]" />
            </Field>
            <Field label="Model ID" hint="Any model accepted">
              <Input list="model-suggestions" value={config.model} onChange={(event) => patch({ model: event.target.value })} className="h-10 rounded-xl border-border/70 bg-background/40" />
              <datalist id="model-suggestions"><option value={preset?.modelHint} /><option value="gpt-4.1-mini" /><option value="claude-sonnet-4-5" /><option value="gemini-2.5-flash" /></datalist>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="HTTP method">
                <Select value={config.method} onValueChange={(value) => patch({ method: value as typeof config.method })}>
                  <SelectTrigger className="h-10 w-full rounded-xl border-border/70 bg-background/40"><SelectValue /></SelectTrigger>
                  <SelectContent>{['POST', 'GET', 'PUT'].map((method) => <SelectItem key={method} value={method}>{method}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Authentication">
                <Select value={config.authType} onValueChange={(value) => patch({ authType: value as typeof config.authType })}>
                  <SelectTrigger className="h-10 w-full rounded-xl border-border/70 bg-background/40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bearer">Bearer token</SelectItem><SelectItem value="api-key-header">API key header</SelectItem><SelectItem value="query">Query parameter</SelectItem><SelectItem value="basic">Basic auth</SelectItem><SelectItem value="custom-header">Custom header</SelectItem><SelectItem value="none">No auth</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            {['api-key-header', 'custom-header'].includes(config.authType) && <Field label="Authentication header"><Input value={config.authHeader} onChange={(event) => patch({ authHeader: event.target.value })} className="h-10 rounded-xl border-border/70 bg-background/40 font-mono text-xs" /></Field>}
            {config.authType === 'query' && <Field label="API key query name"><Input value={config.queryKey} onChange={(event) => patch({ queryKey: event.target.value })} className="h-10 rounded-xl border-border/70 bg-background/40 font-mono text-xs" /></Field>}
            {config.authType === 'basic' && <Field label="Basic auth username"><Input value={config.basicUsername} onChange={(event) => patch({ basicUsername: event.target.value })} className="h-10 rounded-xl border-border/70 bg-background/40" /></Field>}
            <Field label={config.authType === 'none' ? 'API key (not used)' : 'API key'} hint="Never saved">
              <div className="relative">
                <Input type={showKey ? 'text' : 'password'} value={config.apiKey} onChange={(event) => patch({ apiKey: event.target.value })} disabled={config.authType === 'none'} placeholder={config.authType === 'none' ? 'No key required' : 'Enter for this session'} autoComplete="off" className="h-10 rounded-xl border-border/70 bg-background/40 pr-10 font-mono" />
                <Button type="button" variant="ghost" size="icon-sm" className="absolute right-1.5 top-1.5" onClick={() => setShowKey((value) => !value)} disabled={config.authType === 'none'} aria-label={showKey ? 'Hide API key' : 'Show API key'}>{showKey ? <EyeOff /> : <Eye />}</Button>
              </div>
            </Field>
            <div className={`flex items-start gap-3 rounded-2xl border p-3 ${config.directMode ? 'border-amber-400/25 bg-amber-400/8' : 'border-border/60 bg-background/25'}`}>
              {config.directMode ? <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-500" /> : <KeyRound className="mt-0.5 size-4 shrink-0 text-primary" />}
              <div className="flex-1"><p className="text-xs font-medium">{config.directMode ? 'Direct / Local mode' : 'Hosted proxy mode'}</p><p className="mt-1 text-[10px] leading-4 text-muted-foreground">{config.directMode ? 'Your browser sends the key directly. The API must allow CORS; use this for localhost and trusted endpoints only.' : 'The key is forwarded for this request and discarded. Private-network targets and unsafe redirects are blocked.'}</p></div>
              <Switch checked={config.directMode} onCheckedChange={(checked) => patch({ directMode: checked })} aria-label="Toggle Direct / Local mode" />
            </div>
          </TabsContent>

          <TabsContent value="request" className="mt-5 space-y-5">
            <Field label="Request format">
              <Select value={config.requestMode} onValueChange={(value) => patch({ requestMode: value as typeof config.requestMode })}>
                <SelectTrigger className="h-10 w-full rounded-xl border-border/70 bg-background/40"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="openai">OpenAI compatible</SelectItem><SelectItem value="anthropic">Anthropic compatible</SelectItem><SelectItem value="gemini">Gemini compatible</SelectItem><SelectItem value="raw">Raw JSON template</SelectItem></SelectContent>
              </Select>
            </Field>
            {config.requestMode === 'raw' && (
              <Field label="Request template" hint="Editable before sending">
                <Textarea value={config.requestTemplate} onChange={(event) => patch({ requestTemplate: event.target.value })} spellCheck={false} className="min-h-48 resize-y rounded-xl border-border/70 bg-black/20 font-mono text-[11px] leading-5" />
                <p className="text-[9px] leading-4 text-muted-foreground">Variables: {'{{API_KEY}} · {{MODEL}} · {{PROMPT}} · {{SYSTEM_PROMPT}} · {{MESSAGES}}'}</p>
              </Field>
            )}
            <Field label="Response text JSON path" hint="Optional auto-detect">
              <Input value={config.responsePath} onChange={(event) => patch({ responsePath: event.target.value })} placeholder="choices[0].message.content" className="h-10 rounded-xl border-border/70 bg-background/40 font-mono text-[11px]" />
            </Field>
            <KeyValueEditor label="Headers" items={config.headers} onChange={(headers) => patch({ headers })} keyPlaceholder="Header name" />
            <KeyValueEditor label="Query parameters" items={config.queryParams} onChange={(queryParams) => patch({ queryParams })} keyPlaceholder="Parameter" />
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/25 p-3"><div><p className="text-xs font-medium">Streaming</p><p className="mt-1 text-[10px] text-muted-foreground">Progressively render SSE tokens when supported.</p></div><Switch checked={config.streaming} onCheckedChange={(checked) => patch({ streaming: checked })} /></div>
          </TabsContent>

          <TabsContent value="parameters" className="mt-5 space-y-5">
            <Field label="System prompt"><Textarea value={config.systemPrompt} onChange={(event) => patch({ systemPrompt: event.target.value })} className="min-h-24 resize-y rounded-xl border-border/70 bg-background/40" /></Field>
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/25 p-3"><div><p className="text-xs font-medium">Include system prompt</p><p className="mt-1 text-[10px] text-muted-foreground">Translated by the selected adapter.</p></div><Switch checked={config.systemPromptEnabled} onCheckedChange={(checked) => patch({ systemPromptEnabled: checked })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Temperature"><Input type="number" min="0" max="2" step="0.1" value={config.temperature} onChange={(event) => patch({ temperature: Number(event.target.value) })} className="h-10 rounded-xl border-border/70 bg-background/40" /></Field>
              <Field label="Max tokens"><Input type="number" min="1" value={config.maxTokens} onChange={(event) => patch({ maxTokens: Number(event.target.value) })} className="h-10 rounded-xl border-border/70 bg-background/40" /></Field>
              <Field label="Top P"><Input type="number" min="0" max="1" step="0.05" value={config.topP} onChange={(event) => patch({ topP: Number(event.target.value) })} className="h-10 rounded-xl border-border/70 bg-background/40" /></Field>
              <Field label="Timeout (ms)"><Input type="number" min="1000" max="120000" step="1000" value={config.timeoutMs} onChange={(event) => patch({ timeoutMs: Number(event.target.value) })} className="h-10 rounded-xl border-border/70 bg-background/40" /></Field>
            </div>
            <Field label="Provider-specific parameters" hint="Merged into the request"><Textarea value={config.extraParameters} onChange={(event) => patch({ extraParameters: event.target.value })} spellCheck={false} className="min-h-28 rounded-xl border-border/70 bg-black/20 font-mono text-[11px]" /></Field>
          </TabsContent>
        </Tabs>

        <div className="mt-6 space-y-3 border-t border-border/60 pt-5">
          <Button variant="outline" className="h-10 w-full rounded-xl bg-background/35" onClick={() => void onTest()} disabled={testState.status === 'testing'}><Play /> {testState.status === 'testing' ? 'Testing connection…' : 'Test connection'}</Button>
          {testState.message && <p className={`text-center text-[10px] ${testState.status === 'error' ? 'text-destructive' : 'text-emerald-500'}`}>{testState.message}{testState.latency ? ` · ${testState.latency} ms` : ''}</p>}
          <div className="flex gap-2"><Input value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="Profile name" className="h-9 rounded-xl bg-background/35" /><Button variant="secondary" onClick={() => void saveProfile()}><Save /> Save</Button></div>
          {saveStatus && <p className="text-center text-[10px] text-muted-foreground">{saveStatus}</p>}
        </div>
      </div>
    </aside>
  );
}
