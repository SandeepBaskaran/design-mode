// ============================================================
// Design Mode Server — MCP Server
// 12 tools for coding agents: changes, comments, session summary,
// apply (single + batch), clear, exports (Tailwind/SCSS/JSX),
// session listing, spring/easing apply.
// ============================================================

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { state } from './state.js';
import { sendToExtension, isExtensionConnected } from './websocket-server.js';

function toKebab(s: string): string {
  return s.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
}

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'design-mode', version: '1.0.0' });

  // ═══════════════════════════════════════════════
  // Original Tools (enhanced)
  // ═══════════════════════════════════════════════

  server.tool(
    'get_changes',
    'Get all visual CSS changes, DOM changes, and annotations made in the browser. Returns a comprehensive report with CSS selectors, old/new values, ready-to-use CSS block, and annotation details.',
    async () => {
      const report = state.getChangeReport();
      return { content: [{ type: 'text' as const, text: JSON.stringify(report, null, 2) }] };
    }
  );

  server.tool(
    'get_comments',
    'Get all comments/annotations added to DOM elements.',
    { pageUrl: z.string().optional().describe('Filter by page URL') },
    async ({ pageUrl }) => {
      const comments = state.getComments(pageUrl);
      if (comments.length === 0) return { content: [{ type: 'text' as const, text: 'No comments found.' }] };
      return { content: [{ type: 'text' as const, text: JSON.stringify(comments.map(c => ({
        selector: c.selector, comment: c.text,
        timestamp: new Date(c.timestamp).toISOString(),
        pageUrl: c.pageUrl, resolved: c.resolved || false,
      })), null, 2) }] };
    }
  );

  server.tool(
    'get_session_summary',
    'Get a summary of the current design session including annotations, changes, and connection status.',
    async () => {
      const styleChanges = state.getStyleChanges();
      const textChanges = state.getTextChanges();
      const comments = state.getComments();
      const annotations = state.getAnnotations();
      const sessions = state.listSessions();
      const pending = state.getPendingAnnotations();
      const summary = {
        extensionConnected: isExtensionConnected(),
        activeSessions: sessions.length,
        sessions: sessions.map(s => ({ id: s.id, pageUrl: s.pageUrl, pageTitle: s.pageTitle, startedAt: new Date(s.startedAt).toISOString() })),
        totalStyleChanges: styleChanges.length,
        totalTextChanges: textChanges.length,
        totalComments: comments.length,
        totalAnnotations: annotations.length,
        pendingAnnotations: pending.length,
        annotationsByIntent: {
          fix: annotations.filter(a => a.intent === 'fix').length,
          change: annotations.filter(a => a.intent === 'change').length,
          question: annotations.filter(a => a.intent === 'question').length,
          approve: annotations.filter(a => a.intent === 'approve').length,
          note: annotations.filter(a => a.intent === 'note').length,
        },
        annotationsBySeverity: {
          blocking: annotations.filter(a => a.severity === 'blocking').length,
          important: annotations.filter(a => a.severity === 'important').length,
          suggestion: annotations.filter(a => a.severity === 'suggestion').length,
          info: annotations.filter(a => a.severity === 'info').length,
        },
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }] };
    }
  );

  server.tool(
    'apply_changes',
    'Push CSS changes back to the browser for live preview.',
    {
      elementId: z.string().describe('Design Mode element ID (dm-*)'),
      styles: z.record(z.string()).describe('CSS property-value pairs'),
    },
    async ({ elementId, styles }) => {
      if (!isExtensionConnected()) return { content: [{ type: 'text' as const, text: 'Error: Extension not connected.' }], isError: true };
      sendToExtension({ type: 'APPLY_CHANGES', payload: { elementId, styles } });
      return { content: [{ type: 'text' as const, text: `Applied ${Object.keys(styles).length} style changes to ${elementId}.` }] };
    }
  );

  server.tool('clear_changes', 'Clear all tracked changes, comments, and annotations.', async () => {
    state.clear();
    return { content: [{ type: 'text' as const, text: 'All changes cleared.' }] };
  });

  server.tool('get_tailwind', 'Export CSS changes as Tailwind utility classes.', async () => {
    const changes = state.getStyleChanges();
    if (changes.length === 0) return { content: [{ type: 'text' as const, text: 'No changes to export.' }] };
    const bySelector = new Map<string, Map<string, string>>();
    for (const c of changes) { if (!bySelector.has(c.selector)) bySelector.set(c.selector, new Map()); bySelector.get(c.selector)!.set(c.property, c.newValue); }
    const cssToTw: Record<string, (v:string)=>string> = {
      'display': v=>({block:'block',flex:'flex',grid:'grid','inline-block':'inline-block',none:'hidden'})[v]||'',
      'font-weight': v=>({'400':'font-normal','500':'font-medium','600':'font-semibold','700':'font-bold'})[v]||'',
      'text-align': v=>({left:'text-left',center:'text-center',right:'text-right'})[v]||'',
      'position': v=>v, 'overflow': v=>`overflow-${v}`, 'cursor': v=>`cursor-${v}`,
    };
    const lines: string[] = [];
    for (const [sel, props] of bySelector) {
      const classes: string[] = [];
      for (const [prop, val] of props) {
        const kebab = toKebab(prop); const mapper = cssToTw[kebab];
        if (mapper) { const c = mapper(val); classes.push(c || `[${kebab}:${val.replace(/\s+/g,'_')}]`); }
        else classes.push(`[${kebab}:${val.replace(/\s+/g,'_')}]`);
      }
      lines.push(`/* ${sel} */\nclass="${classes.join(' ')}"`);
    }
    return { content: [{ type: 'text' as const, text: lines.join('\n\n') }] };
  });

  server.tool('get_scss', 'Export CSS changes as nested SCSS.', async () => {
    const changes = state.getStyleChanges();
    if (changes.length === 0) return { content: [{ type: 'text' as const, text: 'No changes to export.' }] };
    const bySelector = new Map<string, Map<string, string>>();
    for (const c of changes) { if (!bySelector.has(c.selector)) bySelector.set(c.selector, new Map()); bySelector.get(c.selector)!.set(c.property, c.newValue); }
    const rules = Array.from(bySelector).map(([sel, props]) => `${sel} {\n${Array.from(props).map(([k,v])=>`  ${toKebab(k)}: ${v};`).join('\n')}\n}`);
    return { content: [{ type: 'text' as const, text: `// Design Mode SCSS Export\n\n${rules.join('\n\n')}` }] };
  });

  server.tool('get_jsx_styles', 'Export CSS changes as camelCase JSX inline style objects.', async () => {
    const changes = state.getStyleChanges();
    if (changes.length === 0) return { content: [{ type: 'text' as const, text: 'No changes to export.' }] };
    const bySelector = new Map<string, Map<string, string>>();
    for (const c of changes) { if (!bySelector.has(c.selector)) bySelector.set(c.selector, new Map()); bySelector.get(c.selector)!.set(c.property, c.newValue); }
    const blocks = Array.from(bySelector).map(([sel, props]) => {
      const entries = Array.from(props).map(([k,v])=>{ const isNum = /^\d+(\.\d+)?$/.test(v); return `  ${k}: ${isNum ? v : `'${v}'`}`; }).join(',\n');
      return `// ${sel}\nconst styles = {\n${entries}\n};`;
    });
    return { content: [{ type: 'text' as const, text: blocks.join('\n\n') }] };
  });

  // Annotation management tools were removed. Annotations still flow into
  // state via the extension and surface in get_session_summary counts; the
  // CRUD/long-poll surface (acknowledge/resolve/dismiss/reply/watch + list)
  // is dropped because there is no sidepanel UI to author/triage them.

  // Phase 8: Session management
  server.tool(
    'list_sessions',
    'List all active design mode sessions across browser tabs.',
    async () => {
      const sessions = state.listSessions();
      if (sessions.length === 0) return { content: [{ type: 'text' as const, text: 'No active sessions.' }] };
      return { content: [{ type: 'text' as const, text: JSON.stringify(sessions.map(s => ({
        id: s.id, pageUrl: s.pageUrl, pageTitle: s.pageTitle,
        startedAt: new Date(s.startedAt).toISOString(),
        lastActivity: new Date(s.lastActivity).toISOString(),
      })), null, 2) }] };
    }
  );

  // Phase 8: Batch processing
  server.tool(
    'batch_apply_changes',
    'Apply CSS changes to multiple elements at once.',
    {
      changes: z.array(z.object({
        elementId: z.string(),
        styles: z.record(z.string()),
      })).describe('Array of element changes'),
    },
    async ({ changes }) => {
      if (!isExtensionConnected()) return { content: [{ type: 'text' as const, text: 'Error: Extension not connected.' }], isError: true };
      let applied = 0;
      for (const change of changes) {
        sendToExtension({ type: 'APPLY_CHANGES', payload: change });
        applied++;
      }
      return { content: [{ type: 'text' as const, text: `Applied changes to ${applied} elements.` }] };
    }
  );

  // Phase 4/8: Spring & easing tools
  server.tool(
    'apply_spring_animation',
    'Apply a spring-based animation to an element with stiffness, damping, and mass parameters.',
    {
      elementId: z.string().describe('Element ID'),
      stiffness: z.number().default(100).describe('Spring stiffness (1-1000)'),
      damping: z.number().default(10).describe('Damping coefficient (1-100)'),
      mass: z.number().default(1).describe('Mass (0.1-10)'),
      property: z.string().default('all').describe('CSS property to animate'),
    },
    async ({ elementId, stiffness, damping, mass, property }) => {
      if (!isExtensionConnected()) return { content: [{ type: 'text' as const, text: 'Error: Extension not connected.' }], isError: true };
      sendToExtension({ type: 'APPLY_SPRING', payload: { elementId, config: { stiffness, damping, mass, bounce: 0, velocity: 0 }, property } });
      return { content: [{ type: 'text' as const, text: `Applied spring animation (stiffness: ${stiffness}, damping: ${damping}, mass: ${mass}) to ${elementId}.` }] };
    }
  );

  server.tool(
    'apply_easing',
    'Apply a custom cubic-bezier easing to an element\'s transitions.',
    {
      elementId: z.string().describe('Element ID'),
      x1: z.number().describe('Bezier control point x1 (0-1)'),
      y1: z.number().describe('Bezier control point y1'),
      x2: z.number().describe('Bezier control point x2 (0-1)'),
      y2: z.number().describe('Bezier control point y2'),
    },
    async ({ elementId, x1, y1, x2, y2 }) => {
      if (!isExtensionConnected()) return { content: [{ type: 'text' as const, text: 'Error: Extension not connected.' }], isError: true };
      sendToExtension({ type: 'APPLY_EASING', payload: { elementId, config: { type: 'cubic-bezier', values: [x1, y1, x2, y2] } } });
      return { content: [{ type: 'text' as const, text: `Applied cubic-bezier(${x1}, ${y1}, ${x2}, ${y2}) to ${elementId}.` }] };
    }
  );

  return server;
}
