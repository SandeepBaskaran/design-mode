// ============================================================
// DIVE — Export Code (Copy CSS / Export Changes)
// Pure helpers behind the Changes-tab "Code" view: filename
// stamping, MIME types, JSON serialization and payload counts.
// ============================================================

export type ExportFormat = 'css' | 'json';

export interface ExportSummary {
  style: number;
  text: number;
  dom: number;
  comment: number;
  total: number;
}

const Zeros: ExportSummary = { style: 0, text: 0, dom: 0, comment: 0, total: 0 };

function count(entry: unknown): number {
  return Array.isArray(entry) ? entry.length : 0;
}

export function summarizeExportPayload(payload: unknown): ExportSummary {
  if (typeof payload !== 'object' || payload === null) return { ...Zeros };
  const p = payload as Record<string, unknown>;
  const groups = Array.isArray(p.routeGroups) ? p.routeGroups : [p];
  const sum = (key: string) => groups.reduce((n: number, g) => n + count((g as Record<string, unknown>)[key]), 0);
  const style = sum('styleChanges');
  const text = sum('textChanges');
  const dom = sum('domChanges');
  const comment = sum('comments');
  return { style, text, dom, comment, total: style + text + dom + comment };
}

export function exportCodeFilename(format: ExportFormat, now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `design-mode-changes-${stamp}.${format}`;
}

export function exportMimeType(format: ExportFormat): string {
  return format === 'json' ? 'application/json' : 'text/css';
}

export function serializeChangesJson(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

export function formatExportCount(summary: ExportSummary): string {
  return `${summary.total} change${summary.total === 1 ? '' : 's'}`;
}
