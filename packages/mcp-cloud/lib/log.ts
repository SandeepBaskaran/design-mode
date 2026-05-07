// ============================================================
// Design Mode Cloud — Structured logging helper.
// PRIVACY RULE: this is the ONLY way routes should log. It prints
// metadata only — never selectors, payload bodies, or screenshots.
// ============================================================

export interface LogMetadata {
  tenantId?: string;
  type?: string;
  byteCount?: number;
  latencyMs?: number;
  status?: number;
  error?: string;
}

export function logEvent(label: string, meta: LogMetadata = {}): void {
  // Stringified once, no payload references possible because the type
  // forbids it.
  const safe: Record<string, unknown> = { label };
  if (meta.tenantId) safe.tenantId = meta.tenantId;
  if (meta.type) safe.type = meta.type;
  if (typeof meta.byteCount === 'number') safe.byteCount = meta.byteCount;
  if (typeof meta.latencyMs === 'number') safe.latencyMs = meta.latencyMs;
  if (typeof meta.status === 'number') safe.status = meta.status;
  if (meta.error) safe.error = meta.error;
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(safe));
}
