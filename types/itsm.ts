export type RawRow = Record<string, string | number | boolean | null | undefined>;

export type NormalizedTicket = {
  id: string;
  ticketId?: string;
  createdAt?: Date;
  resolvedAt?: Date;
  status?: string;
  priority?: string;
  category?: string;
  assignmentGroup?: string;
  description?: string;
  slaStatus?: string;
  originalRow: RawRow;
};

export type ColumnMapping = { source: string; field: keyof Omit<NormalizedTicket, 'id' | 'originalRow'>; confidence: number };
export type QualityFinding = { severity: 'critical' | 'warning' | 'info'; title: string; detail: string; affected: number };

export type Analysis = {
  name: string;
  rows: RawRow[];
  headers: string[];
  mappings: ColumnMapping[];
  tickets: NormalizedTicket[];
  quality: { score: number; findings: QualityFinding[] };
  metrics: { total: number; resolved: number; open: number; resolutionRate?: number; avgResolutionHours?: number; slaCompliance?: number; breaches: number };
  trends: Array<{ period: string; created: number; resolved: number }>;
  categories: Array<{ name: string; value: number }>;
  groups: Array<{ name: string; value: number }>;
  dateRange?: { from: Date; to: Date };
};
