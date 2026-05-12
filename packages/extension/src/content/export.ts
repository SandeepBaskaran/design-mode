// ============================================================
// Design Mode — Export System
// CSS, Tailwind, SCSS, JSX export + GitHub issue generation
// ============================================================

import type { StyleChange } from './change-tracker';

// --- CSS Export ---

export function exportCSS(changes: StyleChange[]): string {
  const bySelector = groupBySelector(changes);
  const rules: string[] = [];
  for (const [sel, props] of bySelector) {
    const decls = Array.from(props).map(([k, v]) => `  ${toKebab(k)}: ${v};`).join('\n');
    rules.push(`${sel} {\n${decls}\n}`);
  }
  return rules.join('\n\n');
}

export function exportElementCSS(elementId: string): string {
  const el = document.querySelector(`[data-dm-id="${elementId}"]`) as HTMLElement;
  if (!el) return '';
  const cs = window.getComputedStyle(el);
  const props = getVisualProps();
  const decls: string[] = [];
  for (const prop of props) {
    const val = cs.getPropertyValue(toKebab(prop));
    if (val && val !== 'none' && val !== 'normal' && val !== 'auto') {
      decls.push(`  ${toKebab(prop)}: ${val};`);
    }
  }
  return `/* Element: ${el.tagName.toLowerCase()}${el.className ? '.' + el.className.split(' ')[0] : ''} */\n{\n${decls.join('\n')}\n}`;
}

export function exportPageCSS(changes: StyleChange[]): string {
  if (changes.length === 0) return '/* No changes recorded */\n';
  return `/* Design Mode — Page Changes */\n/* Generated ${new Date().toISOString()} */\n/* URL: ${window.location.href} */\n\n${exportCSS(changes)}`;
}

// --- Tailwind Export ---

const cssToTailwind: Record<string, (v: string) => string> = {
  'display': (v) => ({ block: 'block', flex: 'flex', grid: 'grid', 'inline-block': 'inline-block', 'inline-flex': 'inline-flex', 'inline-grid': 'inline-grid', none: 'hidden', inline: 'inline' })[v] || '',
  'flex-direction': (v) => ({ row: 'flex-row', 'row-reverse': 'flex-row-reverse', column: 'flex-col', 'column-reverse': 'flex-col-reverse' })[v] || '',
  'justify-content': (v) => ({ 'flex-start': 'justify-start', center: 'justify-center', 'flex-end': 'justify-end', 'space-between': 'justify-between', 'space-around': 'justify-around', 'space-evenly': 'justify-evenly' })[v] || '',
  'align-items': (v) => ({ 'flex-start': 'items-start', center: 'items-center', 'flex-end': 'items-end', stretch: 'items-stretch', baseline: 'items-baseline' })[v] || '',
  'text-align': (v) => ({ left: 'text-left', center: 'text-center', right: 'text-right', justify: 'text-justify' })[v] || '',
  'font-weight': (v) => {
    const map: Record<string, string> = { '100': 'font-thin', '200': 'font-extralight', '300': 'font-light', '400': 'font-normal', '500': 'font-medium', '600': 'font-semibold', '700': 'font-bold', '800': 'font-extrabold', '900': 'font-black' };
    return map[v] || '';
  },
  'text-transform': (v) => ({ uppercase: 'uppercase', lowercase: 'lowercase', capitalize: 'capitalize', none: 'normal-case' })[v] || '',
  'overflow': (v) => ({ hidden: 'overflow-hidden', scroll: 'overflow-scroll', auto: 'overflow-auto', visible: 'overflow-visible' })[v] || '',
  'cursor': (v) => `cursor-${v}`,
  'position': (v) => v,
  'border-radius': (v) => {
    const px = parseInt(v);
    if (px === 0) return 'rounded-none';
    if (px <= 2) return 'rounded-sm';
    if (px <= 4) return 'rounded';
    if (px <= 6) return 'rounded-md';
    if (px <= 8) return 'rounded-lg';
    if (px <= 12) return 'rounded-xl';
    if (px <= 16) return 'rounded-2xl';
    if (px >= 9999) return 'rounded-full';
    return `rounded-[${v}]`;
  },
  'opacity': (v) => `opacity-${Math.round(parseFloat(v) * 100)}`,
};

export function exportTailwind(changes: StyleChange[]): string {
  const bySelector = groupBySelector(changes);
  const lines: string[] = [];
  for (const [sel, props] of bySelector) {
    const classes: string[] = [];
    const custom: string[] = [];
    for (const [prop, val] of props) {
      const kebab = toKebab(prop);
      const mapper = cssToTailwind[kebab];
      if (mapper) {
        const cls = mapper(val);
        if (cls) classes.push(cls);
        else custom.push(`[${kebab}:${val.replace(/\s+/g, '_')}]`);
      } else {
        // Arbitrary value syntax
        custom.push(`[${kebab}:${val.replace(/\s+/g, '_')}]`);
      }
    }
    lines.push(`/* ${sel} */`);
    lines.push(`class="${[...classes, ...custom].join(' ')}"`);
    lines.push('');
  }
  return lines.join('\n');
}

// --- SCSS Export ---

export function exportSCSS(changes: StyleChange[]): string {
  const bySelector = groupBySelector(changes);
  // Group by parent selectors for nesting
  const rules: string[] = [];
  for (const [sel, props] of bySelector) {
    const decls = Array.from(props).map(([k, v]) => `  ${toKebab(k)}: ${v};`).join('\n');
    rules.push(`${sel} {\n${decls}\n}`);
  }
  return `// Design Mode — SCSS Export\n// Generated ${new Date().toISOString()}\n\n${rules.join('\n\n')}`;
}

// --- JSX Export ---

export function exportJSX(changes: StyleChange[]): string {
  const bySelector = groupBySelector(changes);
  const lines: string[] = [];
  for (const [sel, props] of bySelector) {
    const entries = Array.from(props).map(([k, v]) => {
      // Numeric values don't need quotes in JSX
      const isNumeric = /^\d+(\.\d+)?$/.test(v);
      return `  ${k}: ${isNumeric ? v : `'${v}'`}`;
    }).join(',\n');
    lines.push(`// ${sel}\nconst styles = {\n${entries}\n};`);
    lines.push('');
  }
  return lines.join('\n');
}

// --- GitHub Export ---

export function generateGitHubIssueBody(changes: StyleChange[], pageUrl: string, pageTitle: string): string {
  const css = exportCSS(changes);
  const affectedSelectors = [...new Set(changes.map(c => c.selector))];
  return `## Design Changes from Design Mode

**Page:** [${pageTitle}](${pageUrl})
**Date:** ${new Date().toISOString()}
**Changes:** ${changes.length} style modifications across ${affectedSelectors.length} elements

### Affected Elements
${affectedSelectors.map(s => `- \`${s}\``).join('\n')}

### CSS Changes
\`\`\`css
${css}
\`\`\`

### Change Details
| Selector | Property | Old Value | New Value |
|----------|----------|-----------|-----------|\n${changes.map(c => `| \`${c.selector}\` | \`${toKebab(c.property)}\` | \`${c.oldValue}\` | \`${c.newValue}\` |`).join('\n')}

---
*Generated by [Design Mode](https://github.com/SandeepBaskaran/design-mode)*`;
}

export function openGitHubIssue(repoUrl: string, title: string, body: string) {
  const url = `${repoUrl}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  window.open(url, '_blank');
}

// --- Copy to Clipboard ---

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();
    return ok;
  }
}

// --- Helpers ---

function groupBySelector(changes: StyleChange[]): Map<string, Map<string, string>> {
  const map = new Map<string, Map<string, string>>();
  for (const c of changes) {
    if (!map.has(c.selector)) map.set(c.selector, new Map());
    map.get(c.selector)!.set(c.property, c.newValue);
  }
  return map;
}

function toKebab(s: string): string {
  return s.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
}

function getVisualProps(): string[] {
  return ['backgroundColor', 'color', 'fontSize', 'fontWeight', 'fontFamily',
    'lineHeight', 'letterSpacing', 'textAlign', 'textTransform', 'padding',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
    'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius',
    'borderBottomLeftRadius', 'borderBottomRightRadius',
    'border', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft',
    'boxShadow', 'textShadow', 'opacity', 'filter', 'backdropFilter',
    'transform', 'display', 'flexDirection', 'justifyContent', 'alignItems',
    'gap', 'width', 'height', 'maxWidth', 'minHeight', 'overflow', 'cursor',
    'backgroundImage', 'mixBlendMode', 'position', 'top', 'right', 'bottom', 'left', 'zIndex'];
}
