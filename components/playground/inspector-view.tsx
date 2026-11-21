'use client';

import { useMemo, useState } from 'react';
import { Check, Clipboard, Code2, Gauge, ListTree, MessageSquare, Network, ScrollText } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppStore } from '@/stores/app-store';

function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }
  return <Button variant="ghost" size="sm" onClick={() => void copy()}>{copied ? <Check /> : <Clipboard />}{copied ? 'Copied' : label}</Button>;
}

function CodeBlock({ value, label }: { value: string; label?: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/65 bg-black/25">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2"><span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label ?? 'JSON'}</span><CopyButton value={value} /></div>
      <pre className="max-h-[52vh] overflow-auto p-4 font-mono text-[11px] leading-5 text-foreground/85"><code>{value}</code></pre>
    </div>
  );
}

function stringify(value: unknown) {
  if (value === undefined) return 'No data yet.';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); } catch { return 'This value could not be formatted.'; }
}

export function InspectorView({ children }: { children: React.ReactNode }) {
  const tab = useAppStore((state) => state.inspectorTab);
  const setTab = useAppStore((state) => state.setInspectorTab);
  const request = useAppStore((state) => state.lastRequest);
  const response = useAppStore((state) => state.lastResponse);
  const [codeLanguage, setCodeLanguage] = useState<'curl' | 'javascript' | 'python'>('curl');

  const generatedCode = useMemo(() => {
    if (!request) return 'Send a request to generate code.';
    const body = request.body === undefined ? '' : JSON.stringify(request.body, null, 2);
    const headers = Object.entries(request.headers);
    if (codeLanguage === 'javascript') {
      return `const response = await fetch(${JSON.stringify(request.url)}, {\n  method: ${JSON.stringify(request.method)},\n  headers: ${JSON.stringify(request.headers, null, 2).replace(/\n/g, '\n  ')},${body ? `\n  body: JSON.stringify(${body.replace(/\n/g, '\n  ')}),` : ''}\n});\n\nconst data = await response.json();`;
    }
    if (codeLanguage === 'python') {
      return `import requests\n\nresponse = requests.request(\n    ${JSON.stringify(request.method)},\n    ${JSON.stringify(request.url)},\n    headers=${JSON.stringify(request.headers, null, 2).replace(/\n/g, '\n    ')},${body ? `\n    json=${body.replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False').replace(/\bnull\b/g, 'None').replace(/\n/g, '\n    ')},` : ''}\n    timeout=30,\n)\nprint(response.json())`;
    }
    return [
      `curl -X ${request.method} ${JSON.stringify(request.url)}`,
      ...headers.map(([key, value]) => `  -H ${JSON.stringify(`${key}: ${value}`)}`),
      ...(body ? [`  --data-raw ${JSON.stringify(body)}`] : []),
    ].join(' \\\n');
  }, [codeLanguage, request]);

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)} className="min-h-0 flex-1 gap-0">
      <div className="border-b border-border/60 px-4 sm:px-6">
        <TabsList variant="line" className="h-11 w-full justify-start gap-4 overflow-x-auto">
          <TabsTrigger value="chat"><MessageSquare /> Chat</TabsTrigger>
          <TabsTrigger value="request"><Network /> Request</TabsTrigger>
          <TabsTrigger value="response"><ScrollText /> Response</TabsTrigger>
          <TabsTrigger value="headers"><ListTree /> Headers</TabsTrigger>
          <TabsTrigger value="metrics"><Gauge /> Metrics</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="chat" className="min-h-0 flex-1">{children}</TabsContent>
      <TabsContent value="request" className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-7">
        <div className="mx-auto max-w-4xl space-y-5">
          <div className="flex flex-wrap items-center gap-2"><Badge className="rounded-lg">{request?.method ?? '—'}</Badge><code className="min-w-0 flex-1 truncate rounded-lg border border-border/60 bg-card/50 px-3 py-2 text-xs">{request?.url ?? 'Send a request to inspect its URL.'}</code></div>
          <CodeBlock label="Redacted request headers" value={stringify(request?.headers)} />
          <CodeBlock label="Generated request body" value={stringify(request?.body)} />
          <div>
            <div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-semibold"><Code2 className="size-4 text-primary" /> Sample code</div><div className="flex rounded-lg bg-muted p-0.5">{(['curl', 'javascript', 'python'] as const).map((language) => <button key={language} className={`rounded-md px-2 py-1 text-[10px] capitalize ${codeLanguage === language ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`} onClick={() => setCodeLanguage(language)}>{language}</button>)}</div></div>
            <CodeBlock label={`${codeLanguage} · credentials masked`} value={generatedCode} />
          </div>
        </div>
      </TabsContent>
      <TabsContent value="response" className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-7"><div className="mx-auto max-w-4xl space-y-4"><div className="flex items-center gap-2"><Badge variant={response && response.statusCode < 400 ? 'secondary' : 'destructive'}>{response ? `${response.statusCode}` : '—'}</Badge><span className="text-xs text-muted-foreground">Raw provider response</span></div><CodeBlock value={stringify(response?.raw)} /></div></TabsContent>
      <TabsContent value="headers" className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-7"><div className="mx-auto grid max-w-4xl gap-5 lg:grid-cols-2"><CodeBlock label="Request · redacted" value={stringify(request?.headers)} /><CodeBlock label="Response · filtered" value={stringify(response?.responseHeaders)} /></div></TabsContent>
      <TabsContent value="metrics" className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-7">
        <div className="mx-auto max-w-4xl">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['HTTP status', response?.statusCode ?? '—'],
              ['Latency', response ? `${response.latencyMs} ms` : '—'],
              ['Time to first token', response?.ttftMs ? `${response.ttftMs} ms` : '—'],
              ['Total tokens', response?.usage?.totalTokens ?? '—'],
              ['Input tokens', response?.usage?.inputTokens ?? '—'],
              ['Output tokens', response?.usage?.outputTokens ?? '—'],
              ['Response length', response ? `${response.content.length} chars` : '—'],
              ['Estimated cost', response?.provider === 'Mock LLM' ? '$0.0000' : 'Unavailable'],
            ].map(([label, value]) => <div key={label} className="rounded-2xl border border-border/60 bg-card/55 p-4"><p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-2 text-lg font-semibold tracking-[-0.03em]">{value}</p></div>)}
          </div>
          <p className="mt-4 text-[10px] text-muted-foreground">Token usage and cost appear only when a provider reports enough information. OmniLLM does not guess provider pricing.</p>
        </div>
      </TabsContent>
    </Tabs>
  );
}

