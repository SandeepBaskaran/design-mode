// Inspect page :hover/:focus/:focus-visible/:active rules for an element.
// CSSOM read-only — never mutates application classList, never reads :visited.

export const INSPECT_STATES = [':hover', ':focus-visible', ':focus', ':active'] as const;
export type InspectState = (typeof INSPECT_STATES)[number];

export type StateDecl = { property: string; value: string; important: boolean };

export type InspectedStates = Record<InspectState, StateDecl[]>;

export type StyleLike = {
  length: number;
  item(index: number): string | null;
  getPropertyValue(name: string): string;
  getPropertyPriority(name: string): string;
};

export type RuleVisit = {
  selectorText: string;
  style: StyleLike;
  media?: string;
  supports?: string;
};

const MAX_RULES = 50_000;
const VISITED_RE = /:visited\b/i;
const PROP_RE = /^-?[a-z][a-z0-9-]*$/i;

export function emptyInspectedStates(): InspectedStates {
  return { ':hover': [], ':focus-visible': [], ':focus': [], ':active': [] };
}

export function forceClassFromState(state: string): string {
  return 'dm-force-' + String(state).replace(/[^a-z-]/gi, '');
}

export function selectorContainsVisited(selector: string): boolean {
  return VISITED_RE.test(selector);
}

export function splitSelectorList(selectorText: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of selectorText || '') {
    if (ch === '(' || ch === '[') depth++;
    else if ((ch === ')' || ch === ']') && depth > 0) depth--;
    else if (ch === ',' && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function lastCompound(selector: string): string {
  let depth = 0;
  let lastStart = 0;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === '(' || ch === '[') depth++;
    else if ((ch === ')' || ch === ']') && depth > 0) depth--;
    else if (depth === 0 && (ch === ' ' || ch === '>' || ch === '+' || ch === '~')) {
      let j = i;
      while (j < selector.length && /[\s>+~]/.test(selector[j])) j++;
      if (j < selector.length) lastStart = j;
      i = j - 1;
    }
  }
  return selector.slice(lastStart).trim();
}

export function inspectPseudosInCompound(compound: string): InspectState[] {
  const found: InspectState[] = [];
  const seen = new Set<InspectState>();
  const re = /:(hover|focus-visible|focus|active)(?![a-z-])/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(compound))) {
    const raw = m[1].toLowerCase();
    const state: InspectState = raw === 'hover'
      ? ':hover'
      : raw === 'focus-visible'
        ? ':focus-visible'
        : raw === 'active'
          ? ':active'
          : ':focus';
    if (!seen.has(state)) {
      seen.add(state);
      found.push(state);
    }
  }
  return found;
}

export function stripInspectPseudos(selector: string): string {
  return selector.replace(/:(hover|focus-visible|focus|active)(?![a-z-])/gi, '').replace(/\s{2,}/g, ' ').trim();
}

export function declsFromStyle(style: StyleLike): StateDecl[] {
  const out: StateDecl[] = [];
  const n = style.length | 0;
  for (let i = 0; i < n; i++) {
    const property = style.item(i);
    if (!property || !PROP_RE.test(property)) continue;
    const value = (style.getPropertyValue(property) || '').trim();
    if (!value) continue;
    if (/javascript:|expression\s*\(/i.test(value)) continue;
    out.push({
      property,
      value,
      important: style.getPropertyPriority(property) === 'important',
    });
  }
  return out;
}

function mergeDecls(into: StateDecl[], extra: StateDecl[]): void {
  for (const d of extra) {
    const idx = into.findIndex((x) => x.property === d.property);
    if (idx >= 0) into[idx] = d;
    else into.push(d);
  }
}

export function inspectStatesFromRules(
  rules: RuleVisit[],
  matches: (selector: string) => boolean,
): InspectedStates {
  const result = emptyInspectedStates();
  for (const rule of rules) {
    const selectors = splitSelectorList(rule.selectorText || '');
    for (const sel of selectors) {
      if (selectorContainsVisited(sel)) continue;
      const subject = lastCompound(sel);
      const states = inspectPseudosInCompound(subject);
      if (!states.length) continue;
      const stripped = stripInspectPseudos(sel);
      if (!stripped) continue;
      let hit = false;
      try { hit = matches(stripped); } catch { hit = false; }
      if (!hit) continue;
      const decls = declsFromStyle(rule.style);
      if (!decls.length) continue;
      for (const state of states) mergeDecls(result[state], decls);
    }
  }
  return result;
}

export function buildForceStateCss(elementId: string, states: InspectedStates): string {
  if (!/^dm-[\w-]+$/.test(elementId)) return '';
  const blocks: string[] = [];
  for (const state of INSPECT_STATES) {
    const decls = states[state];
    if (!decls.length) continue;
    const cls = forceClassFromState(state);
    const body = decls.map((d) => `  ${d.property}: ${d.value} !important;`).join('\n');
    blocks.push(`[data-dm-id="${elementId}"][data-dm-id].${cls} {\n${body}\n}`);
  }
  return blocks.join('\n');
}

const PAGE_STATE_STYLE_ID = 'dm-page-state-force';

export function setPageStateForceCss(css: string): void {
  let el = document.getElementById(PAGE_STATE_STYLE_ID) as HTMLStyleElement | null;
  if (!css) {
    if (el) el.textContent = '';
    return;
  }
  if (!el) {
    el = document.createElement('style');
    el.id = PAGE_STATE_STYLE_ID;
    (document.head || document.documentElement).appendChild(el);
  }
  el.textContent = css;
}

export function clearPageStateForceCss(): void {
  const el = document.getElementById(PAGE_STATE_STYLE_ID);
  if (el) el.remove();
}

export function clearForceStateClasses(root: ParentNode = document): void {
  const nodes = root.querySelectorAll('[class*="dm-force-"]');
  for (const node of Array.from(nodes)) {
    if (!(node instanceof Element)) continue;
    for (const c of Array.from(node.classList)) {
      if (c.startsWith('dm-force-')) node.classList.remove(c);
    }
  }
}

function isOwnSheet(sheet: CSSStyleSheet): boolean {
  const node = sheet.ownerNode;
  return node instanceof Element && (node.id || '').startsWith('dm-');
}

function styleFromCss(style: CSSStyleDeclaration): StyleLike {
  return {
    length: style.length,
    item: (i) => style.item(i),
    getPropertyValue: (n) => style.getPropertyValue(n),
    getPropertyPriority: (n) => style.getPropertyPriority(n),
  };
}

export function collectAccessibleStyleRules(
  sheets: ArrayLike<CSSStyleSheet>,
  matchMediaFn?: (query: string) => boolean,
): RuleVisit[] {
  const visits: RuleVisit[] = [];
  let order = 0;
  const walk = (rules: CSSRuleList, media?: string, supports?: string): void => {
    for (let i = 0; i < rules.length; i++) {
      if (order >= MAX_RULES) return;
      const rule = rules[i];
      if (rule instanceof CSSStyleRule) {
        order++;
        visits.push({
          selectorText: rule.selectorText || '',
          style: styleFromCss(rule.style),
          media,
          supports,
        });
        const nested = (rule as CSSStyleRule & { cssRules?: CSSRuleList }).cssRules;
        if (nested) walk(nested, media, supports);
        continue;
      }
      if (rule instanceof CSSMediaRule) {
        const query = rule.conditionText || '';
        let matches = true;
        if (matchMediaFn) {
          try { matches = matchMediaFn(query); } catch { matches = true; }
        }
        if (!matches) continue;
        walk(rule.cssRules, query || media, supports);
        continue;
      }
      const inner = (rule as { cssRules?: CSSRuleList }).cssRules;
      if (inner) walk(inner, media, supports);
    }
  };
  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i];
    if (isOwnSheet(sheet)) continue;
    try {
      const rules = sheet.cssRules;
      if (rules) walk(rules);
    } catch {
      // Cross-origin stylesheet — skip.
    }
  }
  return visits;
}

export function inspectElementStates(el: Element): InspectedStates {
  const matchMediaFn = (query: string): boolean => {
    try { return window.matchMedia(query).matches; } catch { return true; }
  };
  const rules = collectAccessibleStyleRules(document.styleSheets, matchMediaFn);
  return inspectStatesFromRules(rules, (selector) => {
    try { return el.matches(selector); } catch { return false; }
  });
}

export function pageStatesSummary(states: InspectedStates): Record<InspectState, number> {
  return {
    ':hover': states[':hover'].length,
    ':focus-visible': states[':focus-visible'].length,
    ':focus': states[':focus'].length,
    ':active': states[':active'].length,
  };
}
