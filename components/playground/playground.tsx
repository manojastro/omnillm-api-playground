'use client';

import { useState } from 'react';
import { ChevronDown, PanelRight, ShieldCheck, Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { executeLLM, testMessage } from '@/lib/client/llm-client';
import { useAppStore } from '@/stores/app-store';
import { ChatSurface } from './chat-surface';
import { ConnectionPanel } from './connection-panel';
import { InspectorView } from './inspector-view';

type TestState = { status: 'idle' | 'testing' | 'success' | 'error'; message?: string; latency?: number };

export function Playground() {
  const config = useAppStore((state) => state.config);
  const configOpen = useAppStore((state) => state.configOpen);
  const setConfigOpen = useAppStore((state) => state.setConfigOpen);
  const setResult = useAppStore((state) => state.setResult);
  const [mobileConfigOpen, setMobileConfigOpen] = useState(false);
  const [testState, setTestState] = useState<TestState>({ status: 'idle' });

  function toggleConfig() {
    if (window.matchMedia('(min-width: 1280px)').matches) setConfigOpen(!configOpen);
    else setMobileConfigOpen(true);
  }

  async function testConnection() {
    setTestState({ status: 'testing', message: 'Sending a safe test request…' });
    const controller = new AbortController();
    try {
      const result = await executeLLM({ config, messages: [testMessage()], test: true }, controller.signal);
      setResult(result.preview, result.response);
      setTestState({ status: 'success', message: `${result.response.statusCode} Connected`, latency: result.response.latencyMs });
    } catch (error) {
      const item = error && typeof error === 'object' ? error as Record<string, unknown> : undefined;
      setTestState({ status: 'error', message: String(item?.message ?? (error instanceof Error ? error.message : 'Connection failed.')) });
    }
  }

  return (
    <div className={`grid h-[calc(100vh-64px)] min-h-[620px] lg:h-screen ${configOpen ? 'xl:grid-cols-[minmax(0,1fr)_360px]' : 'grid-cols-1'}`}>
      <section className="flex min-h-0 min-w-0 flex-col bg-[radial-gradient(circle_at_50%_-18%,color-mix(in_oklch,var(--primary),transparent_91%),transparent_38%)]">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border/60 px-4 sm:px-6">
          <button type="button" onClick={toggleConfig} className="flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 transition hover:bg-foreground/[0.045]">
            <span className="truncate text-sm font-semibold">{config.name}</span>
            <Badge variant="secondary" className="hidden rounded-md bg-primary/12 text-primary sm:flex">{config.providerId === 'mock' ? 'Demo ready' : config.directMode ? 'Direct mode' : 'Proxy mode'}</Badge>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </button>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-lg border border-border/60 bg-card/30 px-2.5 py-1.5 text-[10px] text-muted-foreground sm:flex"><span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgb(52_211_153/70%)]" />{config.apiKey ? 'Key loaded for this session' : config.authType === 'none' ? 'No key required' : 'Key not set'}</div>
            <Button variant="outline" className="border-border/70 bg-card/35" onClick={toggleConfig}><PanelRight /> Configure</Button>
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-3 border-b border-border/50 bg-primary/[0.025] px-4 py-2 text-[10px] text-muted-foreground sm:px-6"><Sparkles className="size-3.5 text-primary" /><span className="font-medium text-foreground">Any endpoint. Any model. One playground.</span><span className="hidden sm:inline">Inspect the exact request, raw response, headers, and latency from the tabs below.</span><ShieldCheck className="ml-auto size-3.5 text-emerald-500" /></div>
          <InspectorView><ChatSurface /></InspectorView>
        </div>
      </section>

      {configOpen && <div className="hidden min-h-0 xl:block"><ConnectionPanel onTest={testConnection} testState={testState} /></div>}

      <Sheet open={mobileConfigOpen} onOpenChange={setMobileConfigOpen}>
        <SheetContent side="right" className="w-[min(94vw,430px)] p-0 sm:max-w-none" showCloseButton={false}>
          <SheetHeader className="sr-only"><SheetTitle>Connection settings</SheetTitle><SheetDescription>Configure the provider, endpoint, authentication, request, and response mapping.</SheetDescription></SheetHeader>
          <ConnectionPanel compact onClose={() => setMobileConfigOpen(false)} onTest={testConnection} testState={testState} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

