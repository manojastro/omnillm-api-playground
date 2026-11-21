'use client';

import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, Clock3, Database, Gauge, RefreshCw, Sigma, type LucideIcon } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { useHistory } from '@/hooks/use-workspace-data';

const chartConfig = {
  calls: { label: 'API calls', color: 'var(--chart-1)' },
  latency: { label: 'Latency (ms)', color: 'var(--chart-2)' },
} satisfies ChartConfig;

export function DashboardWorkspace() {
  const { records, loading, error, refresh } = useHistory();
  const [windowName, setWindowName] = useState<'all' | '24h' | '7d'>('all');
  const filtered = useMemo(() => {
    const cutoff = windowName === '24h' ? Date.now() - 86_400_000 : windowName === '7d' ? Date.now() - 604_800_000 : 0;
    return records.filter((record) => new Date(record.createdAt).getTime() >= cutoff);
  }, [records, windowName]);
  const metrics = useMemo(() => {
    const total = filtered.length;
    const success = filtered.filter((item) => item.statusCode >= 200 && item.statusCode < 400).length;
    const failed = total - success;
    const averageLatency = total ? Math.round(filtered.reduce((sum, item) => sum + item.latencyMs, 0) / total) : 0;
    const tokens = filtered.reduce((sum, item) => sum + (item.usage?.totalTokens ?? 0), 0);
    return { total, success, failed, averageLatency, tokens, successRate: total ? Math.round((success / total) * 100) : 0 };
  }, [filtered]);
  const providerData = useMemo(() => {
    const counts = new Map<string, number>();
    filtered.forEach((record) => counts.set(record.provider, (counts.get(record.provider) ?? 0) + 1));
    return [...counts.entries()].map(([provider, calls]) => ({ provider, calls })).sort((a, b) => b.calls - a.calls).slice(0, 6);
  }, [filtered]);
  const latencyData = useMemo(() => filtered.slice(0, 30).reverse().map((record, index) => ({ run: index + 1, latency: record.latencyMs, provider: record.provider })), [filtered]);
  const latest = filtered[0]?.createdAt;
  const kpis: Array<{ label: string; value: string | number; Icon: LucideIcon; note: string }> = [
    { label: 'Total API calls', value: metrics.total, Icon: Database, note: 'Requests in the selected window' },
    { label: 'Success rate', value: `${metrics.successRate}%`, Icon: Activity, note: `${metrics.success} successful calls` },
    { label: 'Failed calls', value: metrics.failed, Icon: AlertTriangle, note: 'HTTP and network failures' },
    { label: 'Average latency', value: `${metrics.averageLatency} ms`, Icon: Clock3, note: 'End-to-end response time' },
    { label: 'Reported tokens', value: metrics.tokens.toLocaleString(), Icon: Sigma, note: 'Only provider-reported usage' },
  ];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_35%_-15%,color-mix(in_oklch,var(--primary),transparent_93%),transparent_36%)]">
      <header className="border-b border-border/60 px-4 py-7 sm:px-8"><div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-primary"><Activity className="size-4" /> Health dashboard</div><h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">Request health at a glance.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Monitor call volume, reliability, latency, provider mix, and reported token use from your own request history.</p></div><div className="flex items-center gap-2"><div className="flex rounded-xl border border-border/60 bg-card/40 p-1">{(['24h', '7d', 'all'] as const).map((item) => <button key={item} onClick={() => setWindowName(item)} className={`rounded-lg px-3 py-1.5 text-[10px] ${windowName === item ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{item === 'all' ? 'All time' : item}</button>)}</div><Button variant="outline" size="icon" onClick={() => void refresh()} aria-label="Refresh dashboard"><RefreshCw /></Button></div></div></header>
      <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-8">
        {loading ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[0, 1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-28 rounded-2xl" />)}</div> : error ? <div className="rounded-2xl border border-destructive/30 bg-destructive/8 p-5"><p className="text-sm font-semibold text-destructive">Dashboard data is unavailable</p><p className="mt-2 text-xs text-muted-foreground">{error}</p></div> : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {kpis.map(({ label, value, Icon, note }) => <article key={label} className="rounded-2xl border border-border/60 bg-card/50 p-4"><div className="flex items-center justify-between"><p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p><Icon className="size-4 text-primary" /></div><p className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{value}</p><p className="mt-2 text-[9px] text-muted-foreground">{note}</p></article>)}
            </section>

            {filtered.length === 0 ? <section className="rounded-2xl border border-dashed border-border/70 p-12 text-center"><Gauge className="mx-auto size-6 text-muted-foreground" /><p className="mt-4 text-sm font-semibold">No request data yet</p><p className="mt-2 text-xs text-muted-foreground">The dashboard will populate from real playground traffic—no sample metrics are fabricated.</p></section> : <section className="grid gap-5 xl:grid-cols-2">
              <article className="rounded-2xl border border-border/60 bg-card/50 p-4 sm:p-5"><div className="mb-5"><h2 className="text-sm font-semibold">Requests by provider</h2><p className="mt-1 text-[10px] text-muted-foreground">Top six providers · calls in the selected window</p></div><ChartContainer config={chartConfig} className="h-[280px] w-full aspect-auto"><BarChart accessibilityLayer data={providerData} layout="vertical" margin={{ left: 8, right: 22 }}><CartesianGrid horizontal={false} /><YAxis dataKey="provider" type="category" tickLine={false} axisLine={false} width={105} tick={{ fontSize: 10 }} /><XAxis dataKey="calls" type="number" allowDecimals={false} tickLine={false} axisLine={false} /><ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} /><Bar dataKey="calls" fill="var(--color-calls)" radius={[0, 5, 5, 0]} /></BarChart></ChartContainer></article>
              <article className="rounded-2xl border border-border/60 bg-card/50 p-4 sm:p-5"><div className="mb-5"><h2 className="text-sm font-semibold">Latency by recent request</h2><p className="mt-1 text-[10px] text-muted-foreground">Up to 30 most recent calls · milliseconds end to end</p></div>{latencyData.length >= 4 ? <ChartContainer config={chartConfig} className="h-[280px] w-full aspect-auto"><LineChart accessibilityLayer data={latencyData} margin={{ left: 6, right: 12 }}><CartesianGrid vertical={false} /><XAxis dataKey="run" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} width={46} /><ChartTooltip content={<ChartTooltipContent />} /><Line type="monotone" dataKey="latency" stroke="var(--color-latency)" strokeWidth={2} dot={{ r: 2, fill: 'var(--color-latency)' }} activeDot={{ r: 4 }} /></LineChart></ChartContainer> : <div className="grid h-[280px] place-items-center rounded-xl border border-dashed border-border/60 text-center text-xs text-muted-foreground"><p className="max-w-xs leading-5">At least four real requests are needed for an honest latency trend.</p></div>}</article>
            </section>}

            {filtered.length > 0 && <section className="overflow-hidden rounded-2xl border border-border/60 bg-card/45"><div className="flex items-center justify-between border-b border-border/60 p-4"><div><h2 className="text-sm font-semibold">Recent request detail</h2><p className="mt-1 text-[10px] text-muted-foreground">Latest ten calls for operational follow-up</p></div><Badge variant="outline">{Math.min(10, filtered.length)} rows</Badge></div><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead className="bg-background/30 text-[9px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Model</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Latency</th><th className="px-4 py-3">Tokens</th><th className="px-4 py-3">Time</th></tr></thead><tbody>{filtered.slice(0, 10).map((record) => <tr key={record.id} className="border-t border-border/45"><td className="px-4 py-3 font-medium">{record.provider}</td><td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">{record.model}</td><td className="px-4 py-3"><span className={record.statusCode < 400 ? 'text-emerald-500' : 'text-destructive'}>{record.statusCode}</span></td><td className="px-4 py-3 font-mono">{record.latencyMs} ms</td><td className="px-4 py-3 font-mono">{record.usage?.totalTokens ?? '—'}</td><td className="px-4 py-3 text-muted-foreground">{new Date(record.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div></section>}
          </>
        )}
        <footer className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/50 bg-card/30 px-4 py-3 text-[9px] text-muted-foreground"><span>Source: your persisted OmniLLM request history. Secrets are excluded before storage.</span><span>Freshness: {latest ? new Date(latest).toLocaleString() : 'No data'}</span></footer>
      </div>
    </div>
  );
}
