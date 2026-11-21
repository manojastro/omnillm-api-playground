'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  CirclePlus,
  Command,
  Database,
  FlaskConical,
  History,
  Settings2,
  Waypoints,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useWebMcp } from '@/hooks/use-webmcp';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/app-store';

const navItems = [
  { href: '/', icon: FlaskConical, label: 'Playground' },
  { href: '/compare', icon: Waypoints, label: 'Compare' },
  { href: '/history', icon: History, label: 'History' },
  { href: '/providers', icon: Database, label: 'Providers' },
  { href: '/dashboard', icon: Activity, label: 'Dashboard' },
  { href: '/settings', icon: Settings2, label: 'Settings' },
];

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_0_30px_color-mix(in_oklch,var(--primary),transparent_72%)]">
        <Command className="size-4" strokeWidth={2.5} />
      </div>
      {!compact && (
        <div>
          <p className="text-sm font-semibold tracking-[-0.02em]">OmniLLM</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">API Playground</p>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const newChat = useAppStore((state) => state.newChat);
  useWebMcp();

  function startNewChat() {
    newChat();
    router.push('/');
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[224px_minmax(0,1fr)]">
        <aside className="hidden border-r border-border/60 bg-sidebar lg:flex lg:sticky lg:top-0 lg:h-screen lg:flex-col">
          <div className="flex h-16 items-center border-b border-border/60 px-5"><Brand /></div>
          <div className="p-3">
            <Button onClick={startNewChat} className="h-10 w-full justify-start gap-2 rounded-xl" size="lg">
              <CirclePlus /> New chat
              <span className="ml-auto rounded-md border border-black/10 bg-black/10 px-1.5 py-0.5 font-mono text-[10px]">⌘ N</span>
            </Button>
          </div>
          <nav aria-label="Primary navigation" className="space-y-1 px-3">
            {navItems.map(({ href, icon: Icon, label }) => {
              const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition-colors',
                    active
                      ? 'bg-foreground/[0.07] font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-foreground/[0.045] hover:text-foreground',
                  )}
                >
                  <Icon className="size-4" /> {label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-7 px-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Quick start</p>
            <div className="mt-3 space-y-3 text-xs text-muted-foreground">
              <button onClick={() => { useAppStore.getState().selectPreset('mock'); router.push('/'); }} className="block w-full truncate text-left text-foreground/80 hover:text-primary">Try Mock LLM</button>
              <button onClick={() => { useAppStore.getState().selectPreset('custom'); router.push('/'); }} className="block w-full truncate text-left hover:text-primary">Configure custom API</button>
              <Link href="/compare" className="block truncate hover:text-primary">Compare providers</Link>
            </div>
          </div>
          <div className="mt-auto border-t border-border/60 p-3">
            <div className="flex items-center gap-3 rounded-xl px-2 py-2">
              <div className="grid size-8 place-items-center rounded-full bg-secondary text-xs font-bold">W</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">Private workspace</p>
                <p className="truncate text-[10px] text-muted-foreground">Secrets are never persisted</p>
              </div>
              <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgb(52_211_153/70%)]" aria-label="Ready" />
            </div>
          </div>
        </aside>

        <div className="min-w-0 pb-16 lg:pb-0">
          <header className="flex h-16 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl lg:hidden">
            <Brand />
            <Button onClick={startNewChat} size="icon" aria-label="New chat"><CirclePlus /></Button>
          </header>
          {children}
        </div>

        <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-50 grid h-16 grid-cols-6 border-t border-border/70 bg-sidebar/95 px-1 backdrop-blur-xl lg:hidden">
          {navItems.map(({ href, icon: Icon, label }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link key={href} href={href} className={cn('flex flex-col items-center justify-center gap-1 text-[9px]', active ? 'text-primary' : 'text-muted-foreground')}>
                <Icon className="size-4" /><span className="max-w-full truncate">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </main>
  );
}

