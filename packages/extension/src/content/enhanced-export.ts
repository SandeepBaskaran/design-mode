// ============================================================
// Markdown / GitHub-issue exports for "Copy Prompt" + "Send to Agent".
// Designed for minimum-token, maximum-signal output to a coding agent:
// real markdown headers (so parsers see structure), values resolved to
// design tokens when possible (so the agent preserves the design system),
// and a source-files block so the agent opens the right files.
// ============================================================

import { getElementById } from './helpers';
import { getStyleChanges, getTextChanges, getDomChanges } from './change-tracker';
import { getSourceLocation } from './source-detection';
import type { CommentData } from './comments';
import { getRootVarEdits } from './root-var-store';

interface ElementContext {
  selector: string;
  tagName: string;
  smartLabel: string;
  sourceFile?: string;
  componentName?: string;
  framework?: string;
  line?: number;
}

function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
}

function shortenValue(v: string, max = 32): string {
  if (!v) return '';
  return v.length > max ? v.slice(0, max - 1) + '…' : v;
}

function gatherElementContext(elementId: string, selector: string): ElementContext {
  const el = getElementById(elementId);
  let tagName = '';
  let smartLabel = selector;
  let sourceFile: string | undefined;
  let componentName: string | undefined;
  let framework: string | undefined;
  let line: number | undefined;
  if (el) {
    tagName = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const cls = (typeof el.className === 'string' && el.className.trim())
      ? '.' + el.className.trim().split(/\s+/)[0]
      : '';
    smartLabel = id || (tagName + cls) || selector;
    const src = getSourceLocation(el);
    if (src) {
      sourceFile = src.cleanPath || (src.file !== 'unknown' ? src.file : undefined);
      componentName = src.component;
      framework = src.framework;
      line = src.line;
    }
  }
  return { selector, tagName, smartLabel, sourceFile, componentName, framework, line };
}

// ── Page design tokens (CSS custom properties on :root) ──
// Build a value→name map so we can rewrite raw values in the changes list to
// `var(--name)` references — the agent then preserves the design system
// instead of inlining hex colors and px sizes.

interface TokenInfo { name: string; value: string; }

// Emit a focused list of CSS variable changes the user made in this
// session. Only fires when the user has actually modified at least one
// token — otherwise the export stays silent on the design system.
// Returns an empty string when no edits exist, so the caller can skip
// the section without producing trailing whitespace.
function buildTokenChangesSection(): string {
  const edits = getRootVarEdits();
  if (edits.length === 0) return '';
  const lines: string[] = [];
  lines.push('## Tokens changed');
  for (const e of edits) {
    lines.push(`- \`${e.cssVar}\`: ${e.original} → ${e.current}`);
  }
  return lines.join('\n');
}

function detectRootTokens(): TokenInfo[] {
  const tokens = new Map<string, string>();
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        if (rule instanceof CSSStyleRule && (rule.selectorText === ':root' || rule.selectorText === 'html')) {
          for (let i = 0; i < rule.style.length; i++) {
            const name = rule.style[i];
            if (name.startsWith('--')) {
              tokens.set(name, rule.style.getPropertyValue(name).trim());
            }
          }
        }
      }
    } catch {}
  }
  return Array.from(tokens.entries()).map(([name, value]) => ({ name, value }));
}

// Normalize a value for comparison: strip spaces, lower-case, collapse
// 6-digit hex to lowercase with leading #, etc. Robust enough for the
// common cases (hex, rgb/rgba, named colors, px sizes).
function normalize(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, '');
}

function buildTokenLookup(tokens: TokenInfo[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const t of tokens) {
    if (!t.value) continue;
    lookup.set(normalize(t.value), t.name);
  }
  return lookup;
}

// If the value matches a token's resolved value, rewrite it as `var(--name)`.
// Already-`var(...)` values pass through untouched.
function tokenize(value: string, lookup: Map<string, string>, used: Set<string>): string {
  if (!value) return value;
  if (value.startsWith('var(')) {
    const m = value.match(/var\((--[^),\s]+)/);
    if (m) used.add(m[1]);
    return value;
  }
  const hit = lookup.get(normalize(value));
  if (hit) {
    used.add(hit);
    return `var(${hit})`;
  }
  return value;
}

// ── Markdown — short, chronological, agent-friendly ──
export function exportMarkdown(pageComments: CommentData[] = []): string {
  const styleChanges = getStyleChanges();
  const textChanges = getTextChanges();
  const domChanges = getDomChanges();

  const tokens = detectRootTokens();
  const tokenLookup = buildTokenLookup(tokens);
  const tokensUsed = new Set<string>();

  const lines: string[] = [];
  const title = (document.title || '').trim() || 'untitled';
  lines.push(`# Visual changes — ${title}`);
  lines.push(`<${window.location.href}>`);

  // Tokens-changed context — only included when the user has actually
  // modified at least one :root CSS variable in this session. Avoids
  // bloating every export with the full design-system catalog.
  const tokensChanged = buildTokenChangesSection();
  if (tokensChanged) {
    lines.push('');
    lines.push(tokensChanged);
  }

  // Build context once per element for stable short labels + source file hints.
  const idsToContext = new Map<string, ElementContext>();
  const ensureCtx = (elementId: string, selector: string) => {
    if (!idsToContext.has(elementId)) idsToContext.set(elementId, gatherElementContext(elementId, selector));
    return idsToContext.get(elementId)!;
  };

  type Entry = { t: number; line: string };
  const entries: Entry[] = [];

  // Style changes — group consecutive edits to the same element on one line.
  // e.g. `- .btn-primary: color #000 → var(--accent); padding 8px → 12px`
  const styleByElement = new Map<string, typeof styleChanges>();
  for (const c of styleChanges) {
    if (!styleByElement.has(c.elementId)) styleByElement.set(c.elementId, []);
    styleByElement.get(c.elementId)!.push(c);
  }
  // Inline source pointer: `[file:line]` after the selector when source
  // detection found something. Drops the separate "Source files" section
  // and saves the agent a cross-reference hop.
  const sourcePointer = (ctx: ElementContext): string => {
    if (!ctx.sourceFile) return '';
    const loc = ctx.line ? `${ctx.sourceFile}:${ctx.line}` : ctx.sourceFile;
    return ` [${loc}]`;
  };

  for (const list of styleByElement.values()) {
    const ctx = ensureCtx(list[0].elementId, list[0].selector);
    const decls = list
      .map(c => {
        const oldShort = shortenValue(tokenize(c.oldValue, tokenLookup, tokensUsed));
        const newShort = shortenValue(tokenize(c.newValue, tokenLookup, tokensUsed));
        return `${camelToKebab(c.property)} ${oldShort} → ${newShort}`;
      })
      .join('; ');
    const earliest = Math.min(...list.map(c => c.timestamp));
    entries.push({ t: earliest, line: `- ${ctx.smartLabel}${sourcePointer(ctx)}: ${decls}` });
  }

  // Text changes
  for (const c of textChanges) {
    const ctx = ensureCtx(c.elementId, c.selector);
    const oldSnip = shortenValue(c.oldText, 60);
    const newSnip = shortenValue(c.newText, 60);
    entries.push({ t: c.timestamp, line: `- ${ctx.smartLabel}${sourcePointer(ctx)} text: "${oldSnip}" → "${newSnip}"` });
  }

  // DOM changes (delete/duplicate/insert/move). For 'move' we surface the
  // destination so the agent knows the parent + position in code.
  for (const c of domChanges) {
    const ctx = ensureCtx(c.elementId, c.selector);
    let line: string;
    if (c.action === 'move' && c.destination) {
      line = `- ${ctx.smartLabel}${sourcePointer(ctx)} moved → ${c.destination.parentSelector}[${c.destination.index}]`;
    } else {
      const verb =
        c.action === 'delete' ? 'deleted' :
        c.action === 'duplicate' ? 'duplicated' :
        c.action === 'insert' ? 'inserted' :
        c.action === 'move' ? 'moved' : c.action;
      line = `- ${ctx.smartLabel}${sourcePointer(ctx)} ${verb}`;
    }
    entries.push({ t: c.timestamp, line });
  }

  // Reviewer comments — promoted to their own section below for visibility.
  // Style/text/DOM changes go in the chronological list; comments live in
  // their own block so an agent can spot reviewer intent quickly.

  if (entries.length === 0 && pageComments.length === 0) {
    lines.push('');
    lines.push('(no changes recorded yet)');
    return lines.join('\n');
  }

  if (entries.length > 0) {
    entries.sort((a, b) => a.t - b.t);
    lines.push('');
    lines.push('## Changes');
    for (const e of entries) lines.push(e.line);
  }

  // Comments section — only if any pinned notes exist. Inline a source
  // pointer so the agent can reach the file the comment was left on.
  if (pageComments.length > 0) {
    lines.push('');
    lines.push('## Comments');
    for (const c of pageComments) {
      // Comments don't carry an elementId we can look up here; rely on the
      // selector and skip source pointers for them.
      lines.push(`- on ${c.selector}: ${c.text.trim()}`);
    }
  }

  // Available design tokens — only those actually referenced in the changes.
  // Saves the agent a discovery step ("does this codebase have a --primary
  // var?") and signals which design-system primitives this edit touched.
  if (tokensUsed.size > 0) {
    lines.push('');
    lines.push('## Design tokens used');
    const usedList = tokens.filter(t => tokensUsed.has(t.name));
    for (const t of usedList) {
      lines.push(`- \`${t.name}\`: ${t.value}`);
    }
  }

  return lines.join('\n');
}

// ── GitHub issue body — same content with a heavier preamble ──
export function exportGitHubIssueBody(): string {
  const lines: string[] = [];
  lines.push(`## Visual changes required`);
  lines.push(``);
  lines.push(`**Page:** ${document.title}`);
  lines.push(`**URL:** ${window.location.href}`);
  lines.push(``);
  lines.push(exportMarkdown());
  return lines.join('\n');
}
