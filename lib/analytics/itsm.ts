import type { Analysis, ColumnMapping, NormalizedTicket, QualityFinding, RawRow } from '@/types/itsm';

const candidates: Array<[ColumnMapping['field'], RegExp]> = [
  ['ticketId', /^(ticket|incident|case|request|issue).{0,12}(id|no|number|#)?$|^(id|number)$/i],
  ['createdAt', /(created|opened|logged|reported).{0,12}(at|date|time|on)?$/i],
  ['resolvedAt', /(resolved|closed|completed).{0,12}(at|date|time|on)?$/i],
  ['status', /^(state|status|ticket status)$/i],
  ['priority', /^(priority|severity|urgency|impact)$/i],
  ['category', /^(category|issue type|type|classification)$/i],
  ['assignmentGroup', /(assignment|resolver|support).{0,12}(group|team|queue)?$/i],
  ['description', /(short )?description|summary|details|problem/i],
  ['slaStatus', /(sla|service level).{0,18}(status|state|met|breach)?$/i],
];

const value = (row: RawRow, key?: string) => key ? String(row[key] ?? '').trim() : '';
const date = (input: string) => { const parsed = new Date(input); return Number.isNaN(parsed.getTime()) ? undefined : parsed; };
const lower = (input?: string) => input?.toLowerCase() ?? '';

export function detectSchema(headers: string[]): ColumnMapping[] {
  const used = new Set<string>();
  return candidates.flatMap(([field, expression]) => {
    const source = headers.find((header) => !used.has(header) && expression.test(header.replace(/[_-]/g, ' ')));
    if (!source) return [];
    used.add(source);
    const exact = expression.test(source);
    return [{ source, field, confidence: exact ? 94 : 78 }];
  });
}

export function analyzeDataset(name: string, rows: RawRow[]): Analysis {
  const headers = Object.keys(rows[0] ?? {});
  const mappings = detectSchema(headers);
  const sourceFor = (field: ColumnMapping['field']) => mappings.find((mapping) => mapping.field === field)?.source;
  const tickets: NormalizedTicket[] = rows.map((originalRow, index) => ({
    id: `${index + 1}`,
    ticketId: value(originalRow, sourceFor('ticketId')) || undefined,
    createdAt: date(value(originalRow, sourceFor('createdAt'))),
    resolvedAt: date(value(originalRow, sourceFor('resolvedAt'))),
    status: value(originalRow, sourceFor('status')) || undefined,
    priority: value(originalRow, sourceFor('priority')) || undefined,
    category: value(originalRow, sourceFor('category')) || undefined,
    assignmentGroup: value(originalRow, sourceFor('assignmentGroup')) || undefined,
    description: value(originalRow, sourceFor('description')) || undefined,
    slaStatus: value(originalRow, sourceFor('slaStatus')) || undefined,
    originalRow,
  }));
  const findings: QualityFinding[] = [];
  const missing = (field: ColumnMapping['field'], label: string) => {
    const missingCount = tickets.filter((ticket) => !ticket[field]).length;
    if (missingCount) findings.push({ severity: missingCount / Math.max(1, tickets.length) > .2 ? 'warning' : 'info', title: `Missing ${label}`, detail: `${missingCount} records have no ${label.toLowerCase()}.`, affected: missingCount });
  };
  if (!sourceFor('ticketId')) findings.push({ severity: 'warning', title: 'Ticket ID not detected', detail: 'Records can be analyzed, but duplicate-ticket checks are unavailable.', affected: tickets.length });
  missing('createdAt', 'created date'); missing('priority', 'priority'); missing('assignmentGroup', 'assignment group');
  const ids = tickets.map((ticket) => ticket.ticketId).filter(Boolean) as string[];
  const duplicateIds = ids.length - new Set(ids).size;
  if (duplicateIds) findings.push({ severity: 'critical', title: 'Duplicate ticket identifiers', detail: `${duplicateIds} repeated ticket IDs found.`, affected: duplicateIds });
  const invalidSequences = tickets.filter((ticket) => ticket.createdAt && ticket.resolvedAt && ticket.createdAt > ticket.resolvedAt).length;
  if (invalidSequences) findings.push({ severity: 'critical', title: 'Impossible date sequences', detail: `${invalidSequences} tickets resolve before they were created.`, affected: invalidSequences });
  const resolved = tickets.filter((ticket) => ticket.resolvedAt || /resolved|closed|complete/i.test(lower(ticket.status))).length;
  const open = tickets.length - resolved;
  const resolutionHours = tickets.flatMap((ticket) => ticket.createdAt && ticket.resolvedAt ? [(ticket.resolvedAt.getTime() - ticket.createdAt.getTime()) / 3_600_000] : []).filter((hour) => hour >= 0);
  const slaAvailable = tickets.filter((ticket) => ticket.slaStatus);
  const breaches = slaAvailable.filter((ticket) => /breach|fail|miss/i.test(lower(ticket.slaStatus))).length;
  const monthly = new Map<string, { created: number; resolved: number }>();
  tickets.forEach((ticket) => {
    if (!ticket.createdAt) return;
    const period = ticket.createdAt.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const row = monthly.get(period) ?? { created: 0, resolved: 0 };
    row.created += 1; if (ticket.resolvedAt) row.resolved += 1; monthly.set(period, row);
  });
  const counts = (field: 'category' | 'assignmentGroup') => [...tickets.reduce((map, ticket) => { const label = ticket[field]; if (label) map.set(label, (map.get(label) ?? 0) + 1); return map; }, new Map<string, number>()).entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  const dates = tickets.flatMap((ticket) => ticket.createdAt ? [ticket.createdAt] : []);
  const penalty = findings.reduce((score, finding) => score + (finding.severity === 'critical' ? 12 : finding.severity === 'warning' ? 6 : 2), 0);
  return { name, rows, headers, mappings, tickets, quality: { score: Math.max(45, 100 - penalty), findings }, metrics: { total: tickets.length, resolved, open, resolutionRate: tickets.length ? Math.round(resolved / tickets.length * 1000) / 10 : undefined, avgResolutionHours: resolutionHours.length ? Math.round(resolutionHours.reduce((a, b) => a + b, 0) / resolutionHours.length * 10) / 10 : undefined, slaCompliance: slaAvailable.length ? Math.round((slaAvailable.length - breaches) / slaAvailable.length * 1000) / 10 : undefined, breaches }, trends: [...monthly.entries()].map(([period, values]) => ({ period, ...values })), categories: counts('category'), groups: counts('assignmentGroup'), dateRange: dates.length ? { from: new Date(Math.min(...dates.map(Number))), to: new Date(Math.max(...dates.map(Number))) } : undefined };
}
