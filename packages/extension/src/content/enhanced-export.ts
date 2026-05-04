// ============================================================
// Phase 7: Enhanced Output & Export
// Multi-level detail output, structured markdown export,
// element-aware style snapshots, forensic styles, GitHub issue export
// ============================================================

import { getElementById, generateSelector, getComputedStyleSubset } from './helpers';
import { getAnnotations } from './annotations';
import { getStyleChanges, getTextChanges, getDomChanges } from './change-tracker';
import { getSpatialContext, getAccessibilityInfo, getSmartName } from './spatial';
import { getSourceLocation, formatSourceLocation } from './source-detection';
import type { CommentData } from './comments';
import type { OutputDetailLevel, StructuredOutput, Annotation } from '@shared/types';

// ── Multi-level Detail Output ──

export function generateOutput(level: OutputDetailLevel = 'standard'): StructuredOutput {
  const annotations = getAnnotations();
  const styleChanges = getStyleChanges();
  const domChanges = getDomChanges();
  const snapshots: StructuredOutput['elementSnapshots'] = [];

  // Collect unique elements from annotations and changes
  const elementIds = new Set<string>();
  for (const a of annotations) elementIds.add(a.elementId);
  for (const c of styleChanges) elementIds.add(c.elementId);

  if (level !== 'compact') {
    for (const id of elementIds) {
      const el = getElementById(id);
      if (!el) continue;
      const snapshot: StructuredOutput['elementSnapshots'][0] = {
        selector: generateSelector(el),
        styles: level === 'forensic' ? getForensicComputedStyles(el) : getComputedStyleSubset(el),
        html: level === 'forensic' ? el.outerHTML.slice(0, 5000) : el.innerHTML.slice(0, 2000),
      };
      snapshots.push(snapshot);
    }
  }

  return {
    level,
    annotations: level === 'compact'
      ? annotations.map(a => ({ ...a, computedStyles: undefined, nearbyElements: undefined }))
      : annotations,
    changes: styleChanges,
    domChanges,
    pageContext: {
      url: window.location.href,
      title: document.title,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      timestamp: Date.now(),
    },
    elementSnapshots: snapshots,
  };
}

// ── Forensic Computed Styles ──

function getForensicComputedStyles(el: HTMLElement): Record<string, string> {
  const cs = window.getComputedStyle(el);
  const result: Record<string, string> = {};
  for (let i = 0; i < cs.length; i++) {
    const prop = cs[i];
    result[prop] = cs.getPropertyValue(prop);
  }
  return result;
}

// ── Compact Markdown Export (token-efficient, LLM-ready) ──

interface ElementContext {
  selector: string;
  tagName: string;
  classes: string[];
  textSnippet?: string;
  componentName?: string;
  componentChain?: string[];
  sourceFile?: string;
  sourceLine?: number;
  framework?: string;
}

function detectFramework(): { name: string; version?: string; clue: string } | null {
  // React
  if ((window as any).React || document.querySelector('[data-reactroot], [data-reactid]')) {
    return { name: 'React', clue: 'React global / data-reactroot' };
  }
  if (Array.from(document.querySelectorAll('*')).some(el => Object.keys(el).some(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')))) {
    return { name: 'React', clue: 'React fiber on DOM nodes' };
  }
  // Vue
  if ((window as any).Vue || document.querySelector('[data-v-app]') || document.querySelector('[data-server-rendered]')) {
    return { name: 'Vue', clue: 'Vue global / data-v-app' };
  }
  if (Array.from(document.querySelectorAll('*')).some(el => (el as any).__vue__ || (el as any).__vue_app__)) {
    return { name: 'Vue', clue: 'Vue instance on DOM nodes' };
  }
  // Svelte
  if (document.querySelector('[class*="svelte-"]')) {
    return { name: 'Svelte', clue: 'class="svelte-*" hash' };
  }
  // Angular
  if (document.querySelector('[ng-version]')) {
    const v = document.querySelector('[ng-version]')?.getAttribute('ng-version');
    return { name: 'Angular', version: v || undefined, clue: 'ng-version attribute' };
  }
  // Next.js
  if (document.getElementById('__next')) {
    return { name: 'Next.js (React)', clue: '#__next root' };
  }
  // Nuxt
  if (document.getElementById('__nuxt')) {
    return { name: 'Nuxt (Vue)', clue: '#__nuxt root' };
  }
  return null;
}

function detectStylingApproach(): string[] {
  const clues: string[] = [];
  // Tailwind: many short utility classes like p-4, bg-blue-500
  const allClasses = new Set<string>();
  document.querySelectorAll('[class]').forEach(el => {
    const cls = (el as HTMLElement).className;
    if (typeof cls === 'string') cls.split(/\s+/).forEach(c => c && allClasses.add(c));
  });
  const tailwindHints = ['flex','grid','hidden','block','p-1','p-2','p-4','px-4','py-2','m-1','m-2','m-4','text-sm','text-lg','text-xs','text-base','bg-white','bg-black','rounded','rounded-lg','rounded-md','shadow','shadow-md','border','w-full','h-full'];
  const tailwindHits = tailwindHints.filter(h => allClasses.has(h)).length;
  if (tailwindHits >= 4) clues.push('Tailwind CSS (utility classes detected)');

  // CSS Modules: classes with hash suffix like Button_btn__abc123 or btn--abc12
  const cssModulesHash = Array.from(allClasses).filter(c => /__[A-Za-z0-9]{4,8}$/.test(c) || /--[A-Za-z0-9]{4,8}$/.test(c)).length;
  if (cssModulesHash >= 3) clues.push('CSS Modules (hashed class names)');

  // styled-components: classes like sc-abc123 or {Component}__{element}-{hash}
  if (Array.from(allClasses).some(c => /^sc-[a-zA-Z0-9]+/.test(c))) clues.push('styled-components');

  // Emotion: classes like css-abc123
  if (Array.from(allClasses).some(c => /^css-[a-z0-9]+$/.test(c))) clues.push('Emotion / CSS-in-JS (css-* classes)');

  // Bootstrap: classes like btn-primary, col-md-6
  if (Array.from(allClasses).some(c => /^(btn|col|row|card|navbar|alert|badge|d-|justify-content-|align-items-)/.test(c))) clues.push('Bootstrap (utility classes)');

  return clues;
}

function gatherElementContext(elementId: string, selector: string): ElementContext {
  const el = getElementById(elementId);
  const ctx: ElementContext = {
    selector,
    tagName: el?.tagName.toLowerCase() || 'unknown',
    classes: el && typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean) : [],
  };
  if (el) {
    const text = el.textContent?.trim().slice(0, 60).replace(/\s+/g, ' ');
    if (text) ctx.textSnippet = text;
    try {
      const source = getSourceLocation(el);
      if (source) {
        ctx.componentName = source.component;
        ctx.sourceFile = source.cleanPath || source.file;
        ctx.sourceLine = source.line;
        ctx.framework = source.framework;
      }
    } catch {}
  }
  return ctx;
}

// Pick a short, human-friendly label for an element from its context.
// Priority: React component name → smart tag-with-classes (e.g. `button.cta`) → selector tail.
function shortLabel(ctx: ElementContext): string {
  if (ctx.componentName) return `<${ctx.componentName}>`;
  if (ctx.classes.length > 0) {
    // First class is usually the most semantic (BEM block name, component class, etc.)
    return `${ctx.tagName}.${ctx.classes[0]}`;
  }
  // Fall back to the trailing piece of the selector
  const tail = ctx.selector.split('>').pop()?.trim() || ctx.tagName;
  return tail;
}

function shortenValue(v: string, max = 32): string {
  if (!v) return 'unset';
  const cleaned = v.trim().replace(/\s+/g, ' ');
  return cleaned.length > max ? cleaned.slice(0, max - 1) + '…' : cleaned;
}

export function exportMarkdown(_level: OutputDetailLevel = 'standard', pageComments: CommentData[] = []): string {
  const styleChanges = getStyleChanges();
  const textChanges = getTextChanges();
  const domChanges = getDomChanges();
  const annotations = getAnnotations();

  const lines: string[] = [];
  const title = (document.title || '').trim() || 'untitled';
  lines.push(`here are the changes in ${title} ${window.location.href}`);

  // Build context once per element so we can render a stable short label.
  const idsToContext = new Map<string, ElementContext>();
  const ensureCtx = (elementId: string, selector: string) => {
    if (!idsToContext.has(elementId)) idsToContext.set(elementId, gatherElementContext(elementId, selector));
    return idsToContext.get(elementId)!;
  };

  // Collect every change in a single timeline so the agent reads them in the
  // order they were made — a property change always shows up next to the
  // element it changed, never separated by a heading or section.
  type Entry = { t: number; line: string };
  const entries: Entry[] = [];

  // ── Style changes — group consecutive edits to the same element on one line
  // (e.g. "header.hero-card: background #fff → #f8f8f8; border-radius 8 → 12px")
  const styleByElement = new Map<string, typeof styleChanges>();
  for (const c of styleChanges) {
    if (!styleByElement.has(c.elementId)) styleByElement.set(c.elementId, []);
    styleByElement.get(c.elementId)!.push(c);
  }
  for (const list of styleByElement.values()) {
    const ctx = ensureCtx(list[0].elementId, list[0].selector);
    const decls = list
      .map(c => `${camelToKebab(c.property)} ${shortenValue(c.oldValue)} → ${shortenValue(c.newValue)}`)
      .join('; ');
    const earliest = Math.min(...list.map(c => c.timestamp));
    entries.push({ t: earliest, line: `- ${shortLabel(ctx)}: ${decls}` });
  }

  // ── Text changes
  for (const c of textChanges) {
    const ctx = ensureCtx(c.elementId, c.selector);
    const oldSnip = shortenValue(c.oldText, 60);
    const newSnip = shortenValue(c.newText, 60);
    entries.push({ t: c.timestamp, line: `- ${shortLabel(ctx)} text: "${oldSnip}" → "${newSnip}"` });
  }

  // ── DOM changes
  for (const c of domChanges) {
    const ctx = ensureCtx(c.elementId, c.selector);
    let verb: string;
    switch (c.action) {
      case 'delete': verb = 'deleted'; break;
      case 'duplicate': verb = 'duplicated'; break;
      case 'insert': verb = 'inserted'; break;
      case 'move': verb = 'moved'; break;
      default: verb = c.action;
    }
    entries.push({ t: c.timestamp, line: `- ${shortLabel(ctx)} ${verb}` });
  }

  // ── Reviewer notes (comments + annotations)
  for (const c of pageComments) {
    entries.push({ t: c.timestamp || 0, line: `- note on ${c.selector}: ${c.text.trim()}` });
  }
  for (const ann of annotations) {
    const intent = ann.intent ? `[${ann.intent}] ` : '';
    entries.push({ t: ann.timestamp || 0, line: `- ${intent}note on ${ann.elementPath}: ${ann.comment.trim()}` });
  }

  if (entries.length === 0) {
    lines.push('');
    lines.push('(no changes recorded yet)');
    return lines.join('\n');
  }

  // Stable chronological order
  entries.sort((a, b) => a.t - b.t);
  lines.push('');
  for (const e of entries) lines.push(e.line);

  return lines.join('\n');
}

// ── GitHub Issue Body Export ──

export function exportGitHubIssueBody(): string {
  const annotations = getAnnotations().filter(a => a.status !== 'resolved' && a.status !== 'dismissed');
  const changes = getStyleChanges();
  const lines: string[] = [];

  lines.push(`## Visual Changes Required`);
  lines.push(``);
  lines.push(`**Page:** ${document.title}`);
  lines.push(`**URL:** ${window.location.href}`);
  lines.push(``);

  if (annotations.length > 0) {
    lines.push(`### Annotations`);
    lines.push(``);
    for (const ann of annotations) {
      const sev = ann.severity === 'blocking' ? '🔴' : ann.severity === 'important' ? '🟡' : '🔵';
      lines.push(`- ${sev} **[${ann.intent}]** ${ann.comment}`);
      lines.push(`  - Element: \`${ann.elementPath}\``);
      if (ann.selectedText) lines.push(`  - Selected: "${ann.selectedText}"`);
      if (ann.sourceFile) lines.push(`  - Source: \`${ann.sourceFile}\``);
    }
    lines.push(``);
  }

  if (changes.length > 0) {
    lines.push(`### CSS Changes`);
    lines.push(``);
    lines.push('```css');
    const grouped = new Map<string, Array<{ property: string; oldValue: string; newValue: string }>>();
    for (const c of changes) {
      const arr = grouped.get(c.selector) || [];
      arr.push({ property: c.property, oldValue: c.oldValue, newValue: c.newValue });
      grouped.set(c.selector, arr);
    }
    for (const [selector, props] of grouped) {
      lines.push(`${selector} {`);
      for (const p of props) {
        lines.push(`  ${camelToKebab(p.property)}: ${p.newValue}; /* was: ${p.oldValue} */`);
      }
      lines.push(`}`);
    }
    lines.push('```');
  }

  return lines.join('\n');
}

// ── Element-Aware Style Snapshot ──

export function captureElementSnapshot(elementId: string, level: OutputDetailLevel = 'standard'): object | null {
  const el = getElementById(elementId);
  if (!el) return null;

  const base: any = {
    selector: generateSelector(el),
    tagName: el.tagName.toLowerCase(),
    smartName: getSmartName(el),
    classes: (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).filter(Boolean),
    html: el.innerHTML.slice(0, 2000),
    textContent: el.textContent?.slice(0, 500),
  };

  if (level !== 'compact') {
    base.computedStyles = level === 'forensic' ? getForensicComputedStyles(el) : getComputedStyleSubset(el);
    base.spatialContext = getSpatialContext(el);
    base.accessibility = getAccessibilityInfo(el);
  }

  if (level === 'detailed' || level === 'forensic') {
    const source = getSourceLocation(el);
    if (source) base.sourceLocation = source;
  }

  return base;
}

// ── Helpers ──

function camelToKebab(str: string): string {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase();
}

function intentIcon(intent: string): string {
  const map: Record<string, string> = {
    fix: '🔧', change: '✏️', question: '❓', approve: '✅', note: '📝',
  };
  return map[intent] || '📌';
}
