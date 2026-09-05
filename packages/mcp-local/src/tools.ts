import { state } from './state.js';
import { requestFromExtension, isExtensionConnected } from './websocket-server.js';

function toKebab(s: string): string {
  return s.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
}

type ExportFormat = 'css' | 'tailwind' | 'scss' | 'jsx';

export type ToolContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

export type ToolResult = {
  content: ToolContent[];
  isError?: boolean;
};

export type ToolDispatch = (name: string, args?: Record<string, unknown>) => Promise<ToolResult>;

function groupBySelector(): Map<string, Map<string, string>> {
  const bySelector = new Map<string, Map<string, string>>();
  for (const c of state.getStyleChanges()) {
    if (!bySelector.has(c.selector)) bySelector.set(c.selector, new Map());
    bySelector.get(c.selector)!.set(c.property, c.newValue);
  }
  return bySelector;
}

function renderCss(): string {
  const rules: string[] = [];
  for (const [sel, props] of groupBySelector()) {
    const decls = Array.from(props).map(([k, v]) => `  ${toKebab(k)}: ${v};`).join('\n');
    rules.push(`${sel} {\n${decls}\n}`);
  }
  return rules.join('\n\n');
}

function renderScss(): string {
  return `// Design Mode SCSS export\n\n${renderCss()}`;
}

function renderTailwind(): string {
  const cssToTw: Record<string, (v: string) => string> = {
    'display': v => ({ block: 'block', flex: 'flex', grid: 'grid', 'inline-block': 'inline-block', none: 'hidden' })[v] || '',
    'font-weight': v => ({ '400': 'font-normal', '500': 'font-medium', '600': 'font-semibold', '700': 'font-bold' })[v] || '',
    'text-align': v => ({ left: 'text-left', center: 'text-center', right: 'text-right' })[v] || '',
    'position': v => v,
    'overflow': v => `overflow-${v}`,
    'cursor': v => `cursor-${v}`,
  };
  const lines: string[] = [];
  for (const [sel, props] of groupBySelector()) {
    const classes: string[] = [];
    for (const [prop, val] of props) {
      const kebab = toKebab(prop);
      const mapper = cssToTw[kebab];
      const cls = mapper ? mapper(val) : '';
      classes.push(cls || `[${kebab}:${val.replace(/\s+/g, '_')}]`);
    }
    lines.push(`/* ${sel} */\nclass="${classes.join(' ')}"`);
  }
  return lines.join('\n\n');
}

function renderJsx(): string {
  const blocks: string[] = [];
  for (const [sel, props] of groupBySelector()) {
    const entries = Array.from(props).map(([k, v]) => {
      const isNum = /^\d+(\.\d+)?$/.test(v);
      return `  ${k}: ${isNum ? v : `'${v}'`}`;
    }).join(',\n');
    blocks.push(`// ${sel}\nconst styles = {\n${entries}\n};`);
  }
  return blocks.join('\n\n');
}

function renderExport(format: ExportFormat): string {
  switch (format) {
    case 'css': return renderCss();
    case 'tailwind': return renderTailwind();
    case 'scss': return renderScss();
    case 'jsx': return renderJsx();
  }
}

async function getChanges(): Promise<ToolResult> {
  const report: any = state.getChangeReport();
  report.comments = state.getComments().map(c => ({
    id: c.id,
    selector: c.selector,
    text: c.text,
    region: c.region,
    timestamp: new Date(c.timestamp).toISOString(),
    pageUrl: c.pageUrl,
    resolved: c.resolved || false,
    screenshot: `get_screenshot({ commentId: "${c.id}" })`,
  }));
  report.items = [
    ...state.getStyleChanges().map(c => ({ id: c.id, kind: 'style', selector: c.selector, property: c.property, status: c.status || 'todo' })),
    ...state.getTextChanges().map(c => ({ id: c.id, kind: 'text', selector: c.selector, status: c.status || 'todo' })),
    ...state.getDomChanges().map(c => ({ id: c.id, kind: 'dom', selector: c.selector, action: c.action, status: c.status || 'todo' })),
    ...state.getComments().map(c => ({ id: c.id, kind: 'comment', selector: c.selector, status: c.resolved ? 'resolved' : 'todo' })),
  ];
  const handoff = state.getHandoff();
  if (handoff) {
    report.handoff = { ...handoff, requestedAt: new Date(handoff.requestedAt).toISOString() };
  }
  return { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }] };
}

async function applyChanges(args: Record<string, unknown>): Promise<ToolResult> {
  const changes = args.changes;
  if (!isExtensionConnected()) {
    return { content: [{ type: 'text', text: 'Error: Extension not connected.' }], isError: true };
  }
  try {
    const res = await requestFromExtension<{ ok?: boolean; totalProps?: number; totalEls?: number }>(
      'APPLY_CHANGES', { changes }
    );
    const totalProps = res?.totalProps ?? 0;
    const totalEls = res?.totalEls ?? 0;
    return { content: [{ type: 'text', text: `Applied ${totalProps} style change${totalProps === 1 ? '' : 's'} to ${totalEls} element${totalEls === 1 ? '' : 's'}.` }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: `Failed to apply changes: ${e?.message || e}` }], isError: true };
  }
}

async function setChangeStatus(args: Record<string, unknown>): Promise<ToolResult> {
  const status = args.status as 'todo' | 'in_progress' | 'resolved';
  const ids = args.ids as string[] | undefined;
  const count = state.setChangeStatus(status, ids);
  if (isExtensionConnected()) {
    try {
      const res = await requestFromExtension<{ ok?: boolean; count?: number }>(
        'SET_CHANGE_STATUS', { status, ids }
      );
      const applied = typeof res?.count === 'number' ? res.count : count;
      return { content: [{ type: 'text', text: `Marked ${applied} item${applied === 1 ? '' : 's'} as ${status}.` }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Status stored server-side, but the browser did not confirm: ${e?.message || e}` }], isError: true };
    }
  }
  return { content: [{ type: 'text', text: `Marked ${count} item${count === 1 ? '' : 's'} as ${status} (extension offline — panel will not reflect it until reconnect).` }] };
}

async function clearChanges(): Promise<ToolResult> {
  state.clear();
  if (!isExtensionConnected()) {
    return { content: [{ type: 'text', text: 'Server state cleared. Extension offline — the page keeps its edits until it reconnects.' }] };
  }
  try {
    await requestFromExtension('CLEAR_CHANGES', {});
    return { content: [{ type: 'text', text: 'All changes cleared.' }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: `Server state cleared, but the browser did not confirm the page clear: ${e?.message || e}` }], isError: true };
  }
}

async function markCommentResolved(args: Record<string, unknown>): Promise<ToolResult> {
  const commentId = String(args.commentId ?? '');
  const resolved = args.resolved !== false;
  if (!isExtensionConnected()) {
    return { content: [{ type: 'text', text: 'Error: Extension not connected.' }], isError: true };
  }
  try {
    const res = await requestFromExtension<{ ok?: boolean }>('MARK_COMMENT_RESOLVED', { commentId, resolved });
    if (!res?.ok) {
      return { content: [{ type: 'text', text: `No comment found with id ${commentId}.` }], isError: true };
    }
    return { content: [{ type: 'text', text: `Comment ${commentId} marked ${resolved ? 'resolved' : 'open'}.` }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: `Failed to update comment: ${e?.message || e}` }], isError: true };
  }
}

async function getSessionSummary(): Promise<ToolResult> {
  const sessions = state.listSessions();
  const handoff = state.getHandoff();
  const summary = {
    extensionConnected: isExtensionConnected(),
    activeSessions: sessions.length,
    sessions: sessions.map(s => ({
      id: s.id,
      pageUrl: s.pageUrl,
      pageTitle: s.pageTitle,
      startedAt: new Date(s.startedAt).toISOString(),
      lastActivity: new Date(s.lastActivity).toISOString(),
    })),
    totalStyleChanges: state.getStyleChanges().length,
    totalTextChanges: state.getTextChanges().length,
    totalDomChanges: state.getDomChanges().length,
    totalComments: state.getComments().length,
    pendingHandoff: handoff ? { ...handoff, requestedAt: new Date(handoff.requestedAt).toISOString() } : null,
  };
  return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
}

async function exportChanges(args: Record<string, unknown>): Promise<ToolResult> {
  const format = args.format as ExportFormat;
  const changes = state.getStyleChanges();
  if (changes.length === 0) {
    return { content: [{ type: 'text', text: 'No changes to export.' }] };
  }
  return { content: [{ type: 'text', text: renderExport(format) }] };
}

async function getScreenshot(args: Record<string, unknown>): Promise<ToolResult> {
  const selector = args.selector as string | undefined;
  const elementId = args.elementId as string | undefined;
  const commentId = args.commentId as string | undefined;
  if (!isExtensionConnected()) {
    return { content: [{ type: 'text', text: 'Error: Extension not connected.' }], isError: true };
  }
  try {
    const payload = await requestFromExtension<{
      dataUrl?: string;
      error?: string;
      candidates?: Array<{ path: string; label: string }>;
    }>('CAPTURE_SCREENSHOT', { selector, elementId, commentId });
    if (payload?.error || !payload?.dataUrl) {
      let text = `Screenshot failed: ${payload?.error || 'no data returned'}`;
      if (payload?.candidates && payload.candidates.length > 0) {
        text += '\n\nCandidate paths (pick one and call get_screenshot again):';
        for (const c of payload.candidates) {
          text += `\n  - ${c.path}    (${c.label})`;
        }
      }
      return { content: [{ type: 'text', text }], isError: true };
    }
    const m = payload.dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
    if (!m) {
      return {
        content: [{ type: 'text', text: 'Screenshot returned an unexpected data URL format.' }],
        isError: true,
      };
    }
    const [, mimeType, base64] = m;
    const target = commentId ? `comment ${commentId}` : elementId ? `element ${elementId}` : selector ? `selector ${selector}` : 'viewport';
    return {
      content: [
        { type: 'text', text: `Captured screenshot of ${target}.` },
        { type: 'image', data: base64, mimeType },
      ],
    };
  } catch (e: any) {
    return {
      content: [{ type: 'text', text: `Screenshot failed: ${e?.message || String(e)}` }],
      isError: true,
    };
  }
}

export async function executeLocalTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  switch (name) {
    case 'get_changes': return getChanges();
    case 'apply_changes': return applyChanges(args);
    case 'set_change_status': return setChangeStatus(args);
    case 'clear_changes': return clearChanges();
    case 'mark_comment_resolved': return markCommentResolved(args);
    case 'get_session_summary': return getSessionSummary();
    case 'export_changes': return exportChanges(args);
    case 'get_screenshot': return getScreenshot(args);
    default:
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  }
}
