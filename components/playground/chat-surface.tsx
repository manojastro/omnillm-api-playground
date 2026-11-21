'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import {
  Bot,
  Check,
  Clipboard,
  Download,
  FileJson,
  FileText,
  Pencil,
  RefreshCw,
  Send,
  ShieldCheck,
  Square,
  Trash2,
  UserRound,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { workspaceFetch } from '@/lib/client/owner';
import { executeLLM } from '@/lib/client/llm-client';
import { buildProviderRequest } from '@/lib/llm/adapters';
import { redactSecrets } from '@/lib/llm/errors';
import type { ChatMessage, NormalizedLLMResponse, RequestPreview, RequestRecord } from '@/lib/llm/types';
import { useAppStore } from '@/stores/app-store';

function download(filename: string, content: string, type: string) {
  const href = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(href);
}

function childrenText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(childrenText).join('');
  if (node && typeof node === 'object' && 'props' in node) return childrenText((node as React.ReactElement<{ children?: React.ReactNode }>).props.children);
  return '';
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize]}
      components={{
        a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">{children}</a>,
        p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5">{children}</ol>,
        table: ({ children }) => <div className="my-3 overflow-x-auto rounded-xl border border-border/60"><table className="w-full text-left text-xs">{children}</table></div>,
        th: ({ children }) => <th className="border-b border-border/60 bg-muted/50 px-3 py-2 font-semibold">{children}</th>,
        td: ({ children }) => <td className="border-b border-border/40 px-3 py-2">{children}</td>,
        code: ({ className, children }) => className
          ? <code className={`${className} font-mono text-[12px]`}>{children}</code>
          : <code className="rounded-md bg-black/20 px-1.5 py-0.5 font-mono text-[12px] text-primary">{children}</code>,
        pre: ({ children }) => {
          const text = childrenText(children).replace(/\n$/, '');
          return <div className="group/code relative my-3 overflow-hidden rounded-xl border border-border/60 bg-black/30"><button type="button" onClick={() => void navigator.clipboard.writeText(text)} className="absolute right-2 top-2 rounded-md border border-border/50 bg-background/70 px-2 py-1 text-[9px] text-muted-foreground opacity-0 backdrop-blur transition-opacity group-hover/code:opacity-100">Copy code</button><pre className="overflow-x-auto p-4 leading-5">{children}</pre></div>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function MessageActions({
  message,
  isLatestAssistant,
  onEdit,
  onDelete,
  onRegenerate,
}: {
  message: ChatMessage;
  isLatestAssistant: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRegenerate: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const response = useAppStore((state) => state.lastResponse);
  async function copy() {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1 text-muted-foreground opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover/message:opacity-100">
      <Button variant="ghost" size="xs" onClick={() => void copy()}>{copied ? <Check /> : <Clipboard />}{copied ? 'Copied' : 'Copy'}</Button>
      {message.role === 'user' && <Button variant="ghost" size="xs" onClick={onEdit}><Pencil /> Edit</Button>}
      {message.role === 'assistant' && message.id !== 'welcome' && <Button variant="ghost" size="xs" onClick={onRegenerate}><RefreshCw /> Regenerate</Button>}
      <Button variant="ghost" size="xs" onClick={onDelete}><Trash2 /> Delete</Button>
      {isLatestAssistant && response && (
        <>
          <span className="mx-1 h-3 w-px bg-border" />
          <Button variant="ghost" size="xs" onClick={() => download('omnillm-response.md', message.content, 'text/markdown')}><Download /> MD</Button>
          <Button variant="ghost" size="xs" onClick={() => download('omnillm-response.txt', message.content, 'text/plain')}><FileText /> TXT</Button>
          <Button variant="ghost" size="xs" onClick={() => download('omnillm-response.json', JSON.stringify(response.raw, null, 2), 'application/json')}><FileJson /> JSON</Button>
        </>
      )}
    </div>
  );
}

export function ChatSurface() {
  const config = useAppStore((state) => state.config);
  const messages = useAppStore((state) => state.messages);
  const setMessages = useAppStore((state) => state.setMessages);
  const patchMessage = useAppStore((state) => state.patchMessage);
  const deleteMessage = useAppStore((state) => state.deleteMessage);
  const conversationId = useAppStore((state) => state.conversationId);
  const status = useAppStore((state) => state.status);
  const setStatus = useAppStore((state) => state.setStatus);
  const setResult = useAppStore((state) => state.setResult);
  const error = useAppStore((state) => state.error);
  const setError = useAppStore((state) => state.setError);
  const newChat = useAppStore((state) => state.newChat);
  const [draft, setDraft] = useState('');
  const [copiedError, setCopiedError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const latestAssistantId = useMemo(() => [...messages].reverse().find((message) => message.role === 'assistant' && message.id !== 'welcome')?.id, [messages]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: status === 'streaming' ? 'auto' : 'smooth' }); }, [messages, status]);

  useEffect(() => {
    const reusedPrompt = window.sessionStorage.getItem('omnillm.reuse-prompt');
    if (!reusedPrompt) return;
    window.sessionStorage.removeItem('omnillm.reuse-prompt');
    setDraft(reusedPrompt);
  }, []);

  async function persist(record: RequestRecord) {
    try {
      await workspaceFetch('/api/history', { method: 'POST', body: JSON.stringify(record) });
    } catch {
      // The answer remains available even if durable history is temporarily unavailable.
    }
  }

  async function submitPrompt(promptOverride?: string, appendUser = true, baseMessages?: ChatMessage[]) {
    const prompt = (promptOverride ?? draft).trim();
    if (!prompt || status !== 'idle') return;
    setDraft('');
    setError(undefined);
    const createdAt = new Date().toISOString();
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: prompt, createdAt };
    const history = (baseMessages ?? messages).filter((message) => message.id !== 'welcome');
    const outgoing = appendUser ? [...history, userMessage] : history;
    const placeholder: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '', createdAt };
    const visibleBase = appendUser ? [...(baseMessages ?? messages), userMessage] : (baseMessages ?? messages);
    setMessages([...visibleBase, placeholder]);
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus(config.streaming ? 'streaming' : 'sending');
    const requestStarted = performance.now();

    try {
      let streamed = '';
      const result = await executeLLM({ config, messages: outgoing }, controller.signal, (delta) => {
        streamed += delta;
        patchMessage(placeholder.id, streamed);
      });
      patchMessage(placeholder.id, result.response.content || streamed || 'The provider returned an empty response.');
      setResult(result.preview, result.response);
      const finishedMessages = [...outgoing, { ...placeholder, content: result.response.content || streamed }];
      void persist({
        id: crypto.randomUUID(),
        conversationId,
        provider: config.name,
        model: config.model,
        messages: finishedMessages,
        responseText: result.response.content || streamed,
        statusCode: result.response.statusCode,
        latencyMs: result.response.latencyMs,
        usage: result.response.usage,
        request: result.preview,
        response: result.response.raw,
        createdAt: new Date().toISOString(),
      });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') {
        patchMessage(placeholder.id, 'Generation stopped.');
      } else {
        deleteMessage(placeholder.id);
        setError(cause);
        const errorDetails = cause instanceof Error
          ? { name: cause.name, message: cause.message }
          : cause;
        const safeError = redactSecrets(errorDetails, [config.apiKey]);
        const safeErrorObject = safeError && typeof safeError === 'object'
          ? safeError as Record<string, unknown>
          : undefined;
        let failedPreview: RequestPreview | undefined;
        try { failedPreview = buildProviderRequest(config, outgoing).preview; } catch { /* invalid configuration has no preview */ }
        void persist({
          id: crypto.randomUUID(),
          conversationId,
          provider: config.name,
          model: config.model,
          messages: outgoing,
          responseText: String(safeErrorObject?.message ?? 'Request failed.'),
          statusCode: Number(safeErrorObject?.statusCode ?? 0),
          latencyMs: Math.round(performance.now() - requestStarted),
          request: failedPreview,
          response: safeError,
          createdAt: new Date().toISOString(),
        });
      }
    } finally {
      abortRef.current = null;
      setStatus('idle');
    }
  }

  function editMessage(message: ChatMessage) {
    const index = messages.findIndex((item) => item.id === message.id);
    setDraft(message.content);
    setMessages(messages.slice(0, index));
  }

  function regenerate(message: ChatMessage) {
    const index = messages.findIndex((item) => item.id === message.id);
    const base = messages.slice(0, index);
    const previousUser = [...base].reverse().find((item) => item.role === 'user');
    if (previousUser) void submitPrompt(previousUser.content, false, base);
  }

  const errorObject = error && typeof error === 'object' ? error as Record<string, unknown> : undefined;
  const errorTitle = String(errorObject?.title ?? 'Request failed');
  const errorMessage = String(errorObject?.message ?? (error instanceof Error ? error.message : 'Check the configuration and try again.'));
  const technical = errorObject?.technicalDetails ?? error;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-4 py-6 sm:px-8 sm:py-8">
          {messages.length === 1 && messages[0].id === 'welcome' && (
            <div className="mb-6 grid gap-3 sm:grid-cols-3">
              {[
                ['Mock LLM', 'Send a prompt now—no key or setup required.'],
                ['Custom API', 'Map any JSON request and response without code.'],
                ['Compare', 'Run one prompt across several configurations.'],
              ].map(([title, text]) => <button type="button" key={title} onClick={() => title === 'Custom API' ? useAppStore.getState().selectPreset('custom') : title === 'Mock LLM' ? useAppStore.getState().selectPreset('mock') : window.location.assign('/compare')} className="rounded-2xl border border-border/60 bg-card/45 p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/35 hover:bg-card/75"><p className="text-xs font-semibold">{title}</p><p className="mt-2 text-[11px] leading-5 text-muted-foreground">{text}</p></button>)}
            </div>
          )}

          <div className="space-y-7">
            {messages.map((message) => (
              <article key={message.id} className={`group/message flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`grid size-8 shrink-0 place-items-center rounded-xl border ${message.role === 'user' ? 'border-primary/30 bg-primary text-primary-foreground' : 'border-border/70 bg-card/70 text-primary'}`}>
                  {message.role === 'user' ? <UserRound className="size-4" /> : <Bot className="size-4" />}
                </div>
                <div className={`min-w-0 max-w-[min(780px,86%)] ${message.role === 'user' ? 'text-right' : ''}`}>
                  <div className={`mb-2 flex items-center gap-2 ${message.role === 'user' ? 'justify-end' : ''}`}><span className="text-[11px] font-semibold">{message.role === 'user' ? 'You' : message.id === 'welcome' ? 'OmniLLM guide' : config.name}</span>{message.role === 'assistant' && message.id !== 'welcome' && <Badge variant="outline" className="rounded-md px-1.5 py-0 text-[8px]">{config.model}</Badge>}</div>
                  <div className={`rounded-2xl px-4 py-3 text-left text-sm leading-6 ${message.role === 'user' ? 'rounded-tr-md bg-primary text-primary-foreground shadow-[0_12px_32px_color-mix(in_oklch,var(--primary),transparent_88%)]' : 'rounded-tl-md border border-border/60 bg-card/55'}`}>
                    {message.content ? <MarkdownContent content={message.content} /> : <span className="inline-flex items-center gap-1 text-muted-foreground"><span className="size-1.5 animate-pulse rounded-full bg-primary" /><span className="size-1.5 animate-pulse rounded-full bg-primary [animation-delay:150ms]" /><span className="size-1.5 animate-pulse rounded-full bg-primary [animation-delay:300ms]" /></span>}
                  </div>
                  <MessageActions message={message} isLatestAssistant={message.id === latestAssistantId} onEdit={() => editMessage(message)} onDelete={() => deleteMessage(message.id)} onRegenerate={() => regenerate(message)} />
                </div>
              </article>
            ))}
          </div>

          {Boolean(error) && (
            <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/8 p-4">
              <div className="flex items-start gap-3"><div className="mt-0.5 size-2 rounded-full bg-destructive" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-destructive">{errorTitle}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{errorMessage}</p><details className="mt-3"><summary className="cursor-pointer text-[10px] font-medium text-muted-foreground">Technical details</summary><pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-black/20 p-3 font-mono text-[10px] whitespace-pre-wrap">{JSON.stringify(technical, null, 2)}</pre></details></div><Button variant="ghost" size="icon-sm" onClick={async () => { await navigator.clipboard.writeText(JSON.stringify(technical, null, 2)); setCopiedError(true); }}>{copiedError ? <Check /> : <Clipboard />}</Button></div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-border/60 bg-background/80 p-3 backdrop-blur-xl sm:p-4">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-2xl border border-border/70 bg-card/80 p-2 shadow-[0_18px_70px_rgb(0_0_0/16%)] focus-within:border-primary/40">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void submitPrompt();
                }
              }}
              aria-label="Prompt"
              className="max-h-48 min-h-16 resize-none border-0 bg-transparent px-3 py-2 shadow-none focus-visible:ring-0"
              placeholder={`Message ${config.name}…`}
            />
            <div className="flex items-center gap-2 px-1 pb-1">
              <Button variant="ghost" size="sm" onClick={newChat}><Trash2 /> Clear</Button>
              <span className="hidden text-[10px] text-muted-foreground sm:inline">Enter to send · Shift + Enter for newline</span>
              {status !== 'idle' ? <Button className="ml-auto rounded-xl" variant="destructive" onClick={() => abortRef.current?.abort()}><Square /> Stop</Button> : <Button className="ml-auto rounded-xl" onClick={() => void submitPrompt()} disabled={!draft.trim()}><Send /> Send</Button>}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-center gap-2 text-[9px] text-muted-foreground"><ShieldCheck className="size-3.5 text-emerald-500" /> Credentials are masked and excluded from saved history.</div>
        </div>
      </div>
    </div>
  );
}
