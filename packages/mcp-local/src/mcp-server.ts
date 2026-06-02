// ============================================================
// Design Mode Server — MCP Server
// 7 tools for coding agents:
//   - get_changes        : read everything the user edited
//   - apply_changes      : push CSS back to the browser (single or batch)
//   - set_change_status  : mark changes/comments todo / in_progress / resolved
//   - clear_changes      : reset the session
//   - get_session_summary: status + counts + active sessions
//   - export_changes     : emit CSS / Tailwind / SCSS / JSX
//   - get_screenshot     : capture a PNG of the page or a specific element
//
// Spring + easing curves come through naturally inside style change values
// (e.g. `transition: all 0.3s cubic-bezier(...)`); no separate apply tool —
// agents send them via apply_changes like any other CSS.
// ============================================================

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { state } from './state.js';
import { sendToExtension, requestFromExtension, isExtensionConnected } from './websocket-server.js';

function toKebab(s: string): string {
  return s.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
}

// ── Format renderers shared by export_changes ───────────────────────
type ExportFormat = 'css' | 'tailwind' | 'scss' | 'jsx';

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

export function createMcpServer(): McpServer {
  // Keep in sync with APP_VERSION in packages/shared/src/constants.ts
  // (also mirrored in bin/cli.ts and websocket-server.ts HELLO).
  const server = new McpServer({ name: 'design-mode', version: '1.6.0' });

  // ── 1. get_changes ────────────────────────────────────────────────
  server.tool(
    'get_changes',
    'Read everything the user has edited in this session: style changes, text changes, DOM changes, and pinned comments, plus a ready-to-paste CSS block. Spring/easing curves come through inside the style values (e.g. `transition: all 0.3s cubic-bezier(...)`).',
    async () => {
      const report: any = state.getChangeReport();
      report.comments = state.getComments().map(c => ({
        id: c.id,
        selector: c.selector,
        text: c.text,
        timestamp: new Date(c.timestamp).toISOString(),
        pageUrl: c.pageUrl,
        resolved: c.resolved || false,
      }));
      // Flat, id-addressable view so the agent can target set_change_status.
      report.items = [
        ...state.getStyleChanges().map(c => ({ id: c.id, kind: 'style', selector: c.selector, property: c.property, status: c.status || 'todo' })),
        ...state.getTextChanges().map(c => ({ id: c.id, kind: 'text', selector: c.selector, status: c.status || 'todo' })),
        ...state.getComments().map(c => ({ id: c.id, kind: 'comment', selector: c.selector, status: c.resolved ? 'resolved' : 'todo' })),
      ];
      return { content: [{ type: 'text' as const, text: JSON.stringify(report, null, 2) }] };
    }
  );

  // ── 2. apply_changes ──────────────────────────────────────────────
  server.tool(
    'apply_changes',
    'Push CSS changes back to the browser for live preview. Pass an array of element changes — single edits use a one-element array. Style values are CSS strings (cubic-bezier, var(--token), keyframe names — anything you would write in a stylesheet).',
    {
      changes: z.array(z.object({
        elementId: z.string().describe('Design Mode element ID (dm-*)'),
        styles: z.record(z.string()).describe('CSS property-value pairs'),
      })).describe('Array of element changes (single edit = single-element array)'),
    },
    async ({ changes }) => {
      if (!isExtensionConnected()) {
        return { content: [{ type: 'text' as const, text: 'Error: Extension not connected.' }], isError: true };
      }
      for (const change of changes) {
        sendToExtension({ type: 'APPLY_CHANGES', payload: change });
      }
      const totalProps = changes.reduce((n, c) => n + Object.keys(c.styles).length, 0);
      return { content: [{ type: 'text' as const, text: `Applied ${totalProps} style change${totalProps === 1 ? '' : 's'} to ${changes.length} element${changes.length === 1 ? '' : 's'}.` }] };
    }
  );

  // ── 3. set_change_status ──────────────────────────────────────────
  server.tool(
    'set_change_status',
    "Update the status of tracked changes/comments as you work: 'in_progress' when you start implementing them in code, 'resolved' once shipped, or 'todo' to reset. Pass the `id`s from get_changes (see the `items` array); omit `ids` to apply to everything. Resolved items dim in the user's Changes tab so they can see what you've handled.",
    {
      status: z.enum(['todo', 'in_progress', 'resolved']).describe('New status'),
      ids: z.array(z.string()).optional().describe('Change or comment ids from get_changes. Omit to apply to all tracked items.'),
    },
    async ({ status, ids }) => {
      const count = state.setChangeStatus(status, ids);
      if (isExtensionConnected()) {
        sendToExtension({ type: 'SET_CHANGE_STATUS', payload: { status, ids } });
      }
      return { content: [{ type: 'text' as const, text: `Marked ${count} item${count === 1 ? '' : 's'} as ${status}.` }] };
    }
  );

  // ── 4. clear_changes ──────────────────────────────────────────────
  server.tool(
    'clear_changes',
    'Clear all tracked changes and comments for the current session.',
    async () => {
      state.clear();
      return { content: [{ type: 'text' as const, text: 'All changes cleared.' }] };
    }
  );

  // ── 5. get_session_summary ────────────────────────────────────────
  server.tool(
    'get_session_summary',
    'Connection status, active sessions, and counts. Use this for a quick health check before calling apply_changes.',
    async () => {
      const styleChanges = state.getStyleChanges();
      const textChanges = state.getTextChanges();
      const comments = state.getComments();
      const sessions = state.listSessions();
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
        totalStyleChanges: styleChanges.length,
        totalTextChanges: textChanges.length,
        totalComments: comments.length,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }] };
    }
  );

  // ── 6. export_changes ─────────────────────────────────────────────
  server.tool(
    'export_changes',
    'Emit the user\'s style changes in your preferred format: plain CSS, Tailwind utility classes, nested SCSS, or camelCase JSX inline-style objects. Spring/easing values pass through verbatim because they\'re part of the underlying CSS values.',
    {
      format: z.enum(['css', 'tailwind', 'scss', 'jsx']).describe('Output format'),
    },
    async ({ format }) => {
      const changes = state.getStyleChanges();
      if (changes.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No changes to export.' }] };
      }
      return { content: [{ type: 'text' as const, text: renderExport(format) }] };
    }
  );

  // ── 7. get_screenshot ─────────────────────────────────────────────
  server.tool(
    'get_screenshot',
    'Capture a PNG screenshot of the page. Pass the unique `selector` string from `get_changes` output (e.g. "main > section.hero > button:nth-of-type(2)") or a Design Mode element id (dm-*) to crop to one element; otherwise the visible viewport is returned. A generic selector like "button" or "h1" matches multiple elements and will fail with a list of candidate unique paths to pick from.',
    {
      selector: z.string().optional().describe('Unique CSS path for the element. Use the path list_layers returns, or the `selector` value from get_changes. Mutually exclusive with elementId.'),
      elementId: z.string().optional().describe('Design Mode element id (dm-*). Mutually exclusive with selector.'),
    },
    async ({ selector, elementId }) => {
      if (!isExtensionConnected()) {
        return { content: [{ type: 'text' as const, text: 'Error: Extension not connected.' }], isError: true };
      }
      try {
        const payload = await requestFromExtension<{
          dataUrl?: string;
          error?: string;
          candidates?: Array<{ path: string; label: string }>;
        }>('CAPTURE_SCREENSHOT', { selector, elementId });
        if (payload?.error || !payload?.dataUrl) {
          let text = `Screenshot failed: ${payload?.error || 'no data returned'}`;
          if (payload?.candidates && payload.candidates.length > 0) {
            text += '\n\nCandidate paths (pick one and call get_screenshot again):';
            for (const c of payload.candidates) {
              text += `\n  - ${c.path}    (${c.label})`;
            }
          }
          return {
            content: [{ type: 'text' as const, text }],
            isError: true,
          };
        }
        // Strip the `data:image/png;base64,` prefix — MCP image content
        // expects the base64 payload bare, with mimeType separate.
        const m = payload.dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
        if (!m) {
          return {
            content: [{ type: 'text' as const, text: 'Screenshot returned an unexpected data URL format.' }],
            isError: true,
          };
        }
        const [, mimeType, base64] = m;
        const target = elementId ? `element ${elementId}` : selector ? `selector ${selector}` : 'viewport';
        return {
          content: [
            { type: 'text' as const, text: `Captured screenshot of ${target}.` },
            { type: 'image' as const, data: base64, mimeType },
          ],
        };
      } catch (e: any) {
        return {
          content: [{ type: 'text' as const, text: `Screenshot failed: ${e?.message || String(e)}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}
