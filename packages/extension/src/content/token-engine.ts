// ============================================================
// Design Mode — Token engine
//
// Single source of truth for CSS custom-property (design token)
// discovery. Tokens are collected from every same-origin stylesheet
// rule that declares a `--*` property — :root, theme scopes
// (`.cds--g100`, `[data-theme]`, `.dark`), and component scopes —
// with design-system recognition (Carbon, Material, shadcn, …).
// ============================================================

export type TokenGroup =
  | 'colour' | 'typography' | 'spacing' | 'radius' | 'shadow' | 'other';

export type TokenScopeKind = 'root' | 'theme' | 'component';

export type TokenScope = {
  selector: string;
  kind: TokenScopeKind;
  active: boolean;
  matchCount: number;
};

export type DesignSystemId =
  | 'carbon' | 'material' | 'mui' | 'bootstrap' | 'polaris' | 'radix' | 'shadcn' | 'tailwind';

export type DesignSystemProfile = { id: DesignSystemId; label: string; tokenCount: number };

// One entry per token variable. A design system declares the same token
// once per theme, so `variants` carries the per-scope values and `scope`
// names the primary (the active scope declaring the most tokens) — the
// one the panel shows until the user picks another.
export type TokenVariant = { scope: TokenScope; value: string; resolvedValue: string };

export type PageToken = {
  cssVar: string;
  value: string;           // authored value in the primary scope (may be a var() chain)
  resolvedValue: string;   // resolved at the primary scope's matched element
  group: TokenGroup;
  usageCount: number;
  scope: TokenScope;
  scopes: string[];        // every selector where the var is declared
  variants: TokenVariant[];
  system?: DesignSystemId;
};

export type TokenIndex = {
  tokens: PageToken[];
  systems: DesignSystemProfile[];
  byVar: Map<string, PageToken>;
  scopes: TokenScope[];
  scannedAt: number;
};

export type StyleRule = { selectorText: string; style: CSSStyleDeclaration; order: number };

// ── Design-system profiles ────────────────────────────────────

type SystemRule = {
  id: DesignSystemId;
  label: string;
  prefixes?: string[];
  nameSet?: Set<string>;
  minHits: number;
};

// Order matters: first matching rule claims the var. shadcn's exact
// name-set sits before Tailwind's namespaces so shared names on a
// shadcn+Tailwind page attribute to shadcn.
const SYSTEM_RULES: SystemRule[] = [
  { id: 'carbon', label: 'IBM Carbon', prefixes: ['--cds-'], minHits: 8 },
  { id: 'material', label: 'Material Design', prefixes: ['--md-', '--mdc-'], minHits: 8 },
  { id: 'mui', label: 'MUI', prefixes: ['--mui-'], minHits: 8 },
  { id: 'bootstrap', label: 'Bootstrap', prefixes: ['--bs-'], minHits: 8 },
  { id: 'polaris', label: 'Shopify Polaris', prefixes: ['--p-'], minHits: 8 },
  { id: 'radix', label: 'Radix Themes', prefixes: ['--radix-'], minHits: 8 },
  {
    id: 'shadcn', label: 'shadcn/ui', minHits: 6,
    nameSet: new Set([
      '--background', '--foreground', '--primary', '--primary-foreground',
      '--secondary', '--secondary-foreground', '--muted', '--muted-foreground',
      '--accent', '--accent-foreground', '--destructive', '--destructive-foreground',
      '--border', '--input', '--ring', '--radius',
      '--card', '--card-foreground', '--popover', '--popover-foreground',
    ]),
  },
  { id: 'tailwind', label: 'Tailwind', prefixes: ['--color-', '--spacing-', '--font-', '--radius-', '--text-', '--shadow-'], minHits: 12 },
];

function systemFor(cssVar: string): DesignSystemId | null {
  for (const r of SYSTEM_RULES) {
    if (r.nameSet?.has(cssVar)) return r.id;
    if (r.prefixes?.some(p => cssVar.startsWith(p))) return r.id;
  }
  return null;
}

// System-specific grouping, tried before the generic prefix/value
// heuristics — a design system's own taxonomy beats name guessing.
function classifyBySystem(system: DesignSystemId, cssVar: string): TokenGroup | null {
  switch (system) {
    case 'carbon':
      if (cssVar.startsWith('--cds-spacing') || cssVar.startsWith('--cds-layout')) return 'spacing';
      if (/^--cds-((productive|expressive)-heading|heading|body|label|legal|code|helper-text|caption)/.test(cssVar)) return 'typography';
      return null;
    case 'material':
      if (cssVar.startsWith('--md-sys-color-') || cssVar.startsWith('--mdc-theme-')) return 'colour';
      if (cssVar.startsWith('--md-sys-typescale-')) return 'typography';
      if (cssVar.startsWith('--md-sys-shape-')) return 'radius';
      return null;
    case 'shadcn':
      return cssVar.startsWith('--radius') ? 'radius' : 'colour';
    case 'tailwind':
      if (cssVar.startsWith('--color-')) return 'colour';
      if (cssVar.startsWith('--spacing-')) return 'spacing';
      if (cssVar.startsWith('--font-') || cssVar.startsWith('--text-')) return 'typography';
      if (cssVar.startsWith('--radius-')) return 'radius';
      if (cssVar.startsWith('--shadow-')) return 'shadow';
      return null;
    default:
      return null;
  }
}

// ── Generic classification (fallback) ─────────────────────────
// Map a `--var-name` prefix to a semantic group. Order matters — earlier
// entries win. Sites use a wild range of naming so the matchers are
// generous; the value-based heuristic below is the final fallback.

const GROUP_PREFIX_RULES: { group: TokenGroup; prefixes: string[] }[] = [
  { group: 'colour', prefixes: ['color', 'clr', 'palette', 'brand', 'accent', 'primary', 'secondary', 'tertiary', 'bg', 'background', 'surface', 'fg', 'foreground', 'text', 'border', 'ring', 'shadow-color', 'btn', 'button'] },
  { group: 'typography', prefixes: ['font', 'text-size', 'text-weight', 'text-style', 'letter', 'leading', 'line-height', 'tracking', 'type', 'typo', 'heading'] },
  { group: 'spacing', prefixes: ['space', 'spacing', 'gap', 'pad', 'padding', 'mg', 'margin', 'inset', 'size-space'] },
  { group: 'radius', prefixes: ['radius', 'rounded', 'corner'] },
  { group: 'shadow', prefixes: ['shadow', 'elevation', 'depth'] },
];

function classifyByPrefix(cssVar: string): TokenGroup | null {
  const name = cssVar.replace(/^--/, '').toLowerCase();
  for (const rule of GROUP_PREFIX_RULES) {
    for (const p of rule.prefixes) {
      if (name === p || name.startsWith(p + '-') || name.startsWith(p + '_')) return rule.group;
    }
  }
  return null;
}

function classifyByValue(value: string): TokenGroup {
  const v = value.trim().toLowerCase();
  if (!v) return 'other';
  if (
    v.startsWith('#') ||
    v.startsWith('rgb') ||
    v.startsWith('hsl') ||
    v.startsWith('oklch') ||
    v.startsWith('oklab') ||
    v.startsWith('lab(') ||
    v.startsWith('lch(') ||
    v.startsWith('hwb(') ||
    v.startsWith('color(')
  ) return 'colour';
  if (/(\d+px|0)\s+(\d+px|0)\s+/.test(v) && /(rgb|hsl|#|oklch|oklab)/.test(v)) return 'shadow';
  if (v.includes('inset') && (v.includes('rgb') || v.includes('#'))) return 'shadow';
  if (/^[\d.]+(px|rem|em|%)?$/.test(v)) return 'spacing';
  if (/^['"a-z]/i.test(v) && v.includes(',')) return 'typography';
  return 'other';
}

function classifyToken(cssVar: string, value: string, system: DesignSystemId | null): TokenGroup {
  if (system) {
    const bySystem = classifyBySystem(system, cssVar);
    if (bySystem) return bySystem;
  }
  return classifyByPrefix(cssVar) ?? classifyByValue(value);
}

// ── Stylesheet walk ───────────────────────────────────────────

const MAX_RULES = 50_000;

function isOwnSheet(sheet: CSSStyleSheet): boolean {
  const node = sheet.ownerNode;
  return node instanceof Element && (node.id || '').startsWith('dm-');
}

function walkStyleRules(visit: (rule: CSSStyleRule, order: number) => void): void {
  let order = 0;
  const walk = (rules: CSSRuleList): void => {
    for (let i = 0; i < rules.length; i++) {
      if (order >= MAX_RULES) return;
      const rule = rules[i];
      if (rule instanceof CSSStyleRule) {
        visit(rule, order++);
        continue;
      }
      // Media blocks only count when the query currently matches (dark-mode
      // token sets stay out of the index while the page renders light).
      if (rule instanceof CSSMediaRule) {
        try { if (!window.matchMedia(rule.conditionText).matches) continue; } catch {}
      }
      // Duck-typed descent covers @supports and @layer without relying on
      // CSSLayerBlockRule existing in the TS lib.
      const inner = (rule as { cssRules?: CSSRuleList }).cssRules;
      if (inner) walk(inner);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    if (isOwnSheet(sheet)) continue;
    try {
      const rules = sheet.cssRules;
      if (rules) walk(rules);
    } catch {} // cross-origin sheet — skip
  }
}

// ── Scope classification ──────────────────────────────────────

export function getScopeElement(selector: string): Element | null {
  if (selector === ':root' || selector === 'html') return document.documentElement;
  try { return document.querySelector(selector); } catch { return null; }
}

// A scope carrying a whole token set is a theme (Carbon's `.cds--g100`,
// a `[data-theme]` host, `.dark`); one carrying a handful of vars styles a
// single component (`.cds--btn { --cds-btn-height }`). Token count is the
// discriminator — a wrapper element's descendant share is not, since
// theme classes commonly sit on small containers.
const THEME_MIN_VARS = 12;

function buildScope(selector: string, declaredVars: number): TokenScope {
  const sel = selector.trim();
  const lower = sel.toLowerCase();
  if (lower === ':root' || lower === 'html') {
    return { selector: sel, kind: 'root', active: true, matchCount: 1 };
  }
  const themeShaped = declaredVars >= THEME_MIN_VARS || lower.includes(':root') || lower.startsWith('html');
  let matches = 0;
  try { matches = document.querySelectorAll(sel).length; } catch {
    return { selector: sel, kind: themeShaped ? 'theme' : 'component', active: false, matchCount: 0 };
  }
  return {
    selector: sel,
    kind: themeShaped ? 'theme' : 'component',
    active: matches > 0,
    matchCount: matches,
  };
}

// ── Usage counting ────────────────────────────────────────────

const USAGE_PROPS = [
  'color', 'backgroundColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
  'outlineColor', 'fill', 'stroke', 'accentColor', 'caretColor',
  'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'gap', 'rowGap', 'columnGap',
  'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius',
  'boxShadow', 'textShadow', 'opacity',
] as const;

function countUsages(tokens: PageToken[]): void {
  if (tokens.length === 0) return;
  const valueCounts = new Map<string, number>();
  const all = document.querySelectorAll<HTMLElement>('*');
  for (let i = 0; i < all.length && i < 10_000; i++) {
    const cs = getComputedStyle(all[i]);
    for (const p of USAGE_PROPS) {
      const v = cs[p as keyof CSSStyleDeclaration] as string | undefined;
      if (!v) continue;
      valueCounts.set(v, (valueCounts.get(v) || 0) + 1);
    }
  }
  for (const t of tokens) {
    const lookup = t.resolvedValue || t.value;
    t.usageCount = valueCounts.get(lookup) || 0;
  }
}

// ── Scan + cache ──────────────────────────────────────────────

let cache: TokenIndex | null = null;
let styleRulesCache: StyleRule[] = [];

export function invalidateTokenIndex(): void {
  cache = null;
}

export function getTokenIndex(maxAgeMs = 15_000): TokenIndex {
  if (cache && Date.now() - cache.scannedAt < maxAgeMs) return cache;
  cache = scanTokenIndex();
  return cache;
}

// Page rules that set at least one property the Design tab renders,
// prefiltered during the token scan so element attribution never re-walks
// the stylesheets. Non-var rules are kept: a more specific literal
// declaration beats a var() one, and attribution has to see that.
export function getStyleRules(): StyleRule[] {
  getTokenIndex();
  return styleRulesCache;
}

// ── Per-property var attribution ──────────────────────────────
// Which token paints each style property of an element. Runs on
// selection only; answers "this button's background-color is authored
// as var(--cds-button-primary)".

// Kebab-case longhands the Design tab renders fields for.
const DESIGN_PROPS = new Set([
  'color', 'background-color',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'outline-color', 'outline-width', 'fill', 'stroke',
  'font-size', 'font-weight', 'font-family', 'line-height', 'letter-spacing',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'gap', 'row-gap', 'column-gap',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
  'box-shadow', 'text-shadow', 'opacity', 'width', 'height',
]);

const SHORTHAND_FANOUT: Record<string, string[]> = {
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  'border-radius': ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'],
  gap: ['row-gap', 'column-gap'],
  'border-color': ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'],
  'border-width': ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'],
  border: ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'],
  background: ['background-color'],
  font: ['font-size', 'font-weight', 'font-family', 'line-height'],
  outline: ['outline-color', 'outline-width'],
};

function declaresDesignProp(style: CSSStyleDeclaration): boolean {
  for (let i = 0; i < style.length; i++) {
    const p = style[i];
    if (DESIGN_PROPS.has(p) || p in SHORTHAND_FANOUT) return true;
  }
  return false;
}

// Rough (a,b,c) specificity folded into one number. `:where()` is zero;
// `:is()`/`:not()` internals count as written — close enough, since the
// computed-value verification gate below catches wrong winners.
function specificityOf(selector: string): number {
  const s = selector.replace(/:where\([^)]*\)/g, ' ');
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const classesAttrsPseudos =
    (s.match(/\.[\w-]+/g) || []).length +
    (s.match(/\[[^\]]*\]/g) || []).length +
    (s.match(/(^|[^:]):[\w-]+/g) || []).length;
  const types = (s.match(/(^|[\s>+~(,])[a-zA-Z][\w-]*/g) || []).length +
    (s.match(/::[\w-]+/g) || []).length;
  return ids * 1_000_000 + classesAttrsPseudos * 1_000 + types;
}

function lengthToPx(v: string, el: Element): number | null {
  const m = v.match(/^(-?[\d.]+)(px|rem|em)$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (m[2] === 'px') return n;
  if (m[2] === 'rem') return n * parseFloat(getComputedStyle(document.documentElement).fontSize);
  return n * parseFloat(getComputedStyle(el).fontSize);
}

// Parse-time canonicalization: '#0f62fe' → 'rgb(15, 98, 254)' so token
// values compare against computed colors.
function canonColor(v: string): string {
  const probe = document.createElement('span');
  probe.style.color = v;
  return probe.style.color || v;
}

function normalizeVal(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, '');
}

function valuesMatch(computedProp: string, varValue: string, el: Element): boolean {
  const a = normalizeVal(computedProp);
  const b = normalizeVal(varValue);
  if (!a || !b) return false;
  if (a === b) return true;
  const aPx = lengthToPx(computedProp.trim(), el);
  const bPx = lengthToPx(varValue.trim(), el);
  if (aPx != null && bPx != null) return Math.abs(aPx - bPx) < 0.1;
  const c = normalizeVal(canonColor(varValue.trim()));
  if (c && a === c) return true;
  // Compound values (box-shadow, border) — the var resolves one part.
  if (a.includes(b) || (c !== b && a.includes(c))) return true;
  return false;
}

function camelize(kebab: string): string {
  return kebab.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
}

// Fallback of a lone `var(--x, fallback)` value — pages built against a
// design system often ship fallbacks that do the actual painting when
// the theme's token definitions aren't loaded on the current page.
function varFallback(raw: string): string | null {
  const m = raw.trim().match(/^var\(\s*--[\w-]+\s*,\s*(.+)\)$/s);
  if (!m) return null;
  const inner = m[1].trim();
  let depth = 0;
  for (const ch of inner) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth < 0) return null;
  }
  return depth === 0 && inner ? inner : null;
}

// Which scope supplies `cssVar` to this element. A design system declares
// the same token once per theme (Carbon ships ~327 vars on each of
// .cds--white / .cds--g100 / …), so the value an element sees comes from
// its nearest ancestor that declares it — editing any other scope would
// silently do nothing to this element.
export function owningScopeFor(el: Element, cssVar: string): string {
  const scopes = getTokenIndex().byVar.get(cssVar)?.scopes;
  if (!scopes || scopes.length === 0) return ':root';
  if (scopes.length === 1) return scopes[0];
  const scoped = scopes.filter(s => s !== ':root' && s !== 'html');
  for (let node: Element | null = el; node; node = node.parentElement) {
    for (const sel of scoped) {
      try { if (node.matches(sel)) return sel; } catch {}
    }
  }
  return scopes.find(s => s === ':root' || s === 'html') ?? scopes[0];
}

export type PropToken = { cssVar: string; scope: string };

export function getAuthoredVarsForElement(el: HTMLElement): Record<string, PropToken> {
  // Winner per property, following the cascade: !important beats normal,
  // inline beats page rules, then specificity, then source order. Every
  // declaration competes — including literal ones, because a more
  // specific `color: #0f62fe` beats `color: var(--brand)` and means the
  // property is NOT token-driven even though a var() rule also matched.
  type Candidate = { raw: string; prio: number; spec: number; order: number };
  const winners = new Map<string, Candidate>();

  const consider = (kebabProp: string, rawValue: string, prio: number, spec: number, order: number) => {
    if (!DESIGN_PROPS.has(kebabProp) || !rawValue) return;
    const prev = winners.get(kebabProp);
    if (prev && (prev.prio > prio ||
      (prev.prio === prio && (prev.spec > spec || (prev.spec === spec && prev.order > order))))) return;
    winners.set(kebabProp, { raw: rawValue, prio, spec, order });
  };

  // prio: 0 normal page, 1 normal inline, 2 important page, 3 important inline
  const harvest = (style: CSSStyleDeclaration, inline: boolean, spec: number, order: number) => {
    const prioFor = (p: string) =>
      (style.getPropertyPriority(p) === 'important' ? 2 : 0) + (inline ? 1 : 0);
    for (let i = 0; i < style.length; i++) {
      const p = style[i];
      if (p.startsWith('--')) continue;
      consider(p, style.getPropertyValue(p), prioFor(p), spec, order);
    }
    // A shorthand authored as `padding: var(--x)` is a pending-substitution
    // value — its longhands read back as '', so probe the shorthand and fan
    // it out. Only var() shorthands need this; literal shorthands already
    // expand into their longhands above.
    for (const [shorthand, longhands] of Object.entries(SHORTHAND_FANOUT)) {
      const v = style.getPropertyValue(shorthand);
      if (!v || !v.includes('var(--')) continue;
      for (const lh of longhands) consider(lh, v, prioFor(shorthand), spec, order);
    }
  };

  for (const rule of getStyleRules()) {
    const parts = rule.selectorText.split(',').map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
      // Pseudo-element parts style a different box than the one the
      // inspector shows.
      if (/::/.test(part)) continue;
      let matched = false;
      try { matched = el.matches(part); } catch {}
      if (!matched) continue;
      harvest(rule.style, false, specificityOf(part), rule.order);
    }
  }

  if (el.style.length > 0) harvest(el.style, true, 0, Number.MAX_SAFE_INTEGER);

  // The extension's own overrides are !important and appended last, so
  // they win — attribution has to agree, or a swapped token would still
  // report the page's original one.
  const dmSheet = document.getElementById('dm-applied-styles') as HTMLStyleElement | null;
  if (dmSheet?.sheet) {
    try {
      const rules = Array.from(dmSheet.sheet.cssRules);
      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        if (!(rule instanceof CSSStyleRule)) continue;
        let matched = false;
        try { matched = el.matches(rule.selectorText); } catch {}
        if (matched) harvest(rule.style, false, specificityOf(rule.selectorText), Number.MAX_SAFE_INTEGER - 1 + i);
      }
    } catch {}
  }

  // Only the properties whose winning declaration is a var() are tokens.
  const candidates = new Map<string, { cssVar: string; raw: string }>();
  for (const [prop, cand] of winners) {
    const m = cand.raw.match(/var\(\s*(--[\w-]+)/);
    if (m) candidates.set(prop, { cssVar: m[1], raw: cand.raw });
  }
  if (candidates.size === 0) return {};

  // Verification gate — fail closed: only report an attribution when the
  // var's resolved value actually shows up in the property's computed
  // value. Kills wrong winners from the specificity approximation.
  const cs = getComputedStyle(el);
  const out: Record<string, PropToken> = {};
  for (const [kebabProp, cand] of candidates) {
    const varValue = cs.getPropertyValue(cand.cssVar).trim() || varFallback(cand.raw) || '';
    if (!varValue) continue;
    const propValue = cs.getPropertyValue(kebabProp).trim();
    if (!propValue) continue;
    if (valuesMatch(propValue, varValue, el)) {
      out[camelize(kebabProp)] = { cssVar: cand.cssVar, scope: owningScopeFor(el, cand.cssVar) };
    }
  }
  return out;
}

export function scanTokenIndex(): TokenIndex {
  type Declaration = { value: string; order: number; scopeSel: string };
  const declsByVar = new Map<string, Declaration[]>();
  const varsBySel = new Map<string, Set<string>>();
  const styleRules: StyleRule[] = [];

  walkStyleRules((rule, order) => {
    const style = rule.style;
    if (declaresDesignProp(style)) {
      styleRules.push({ selectorText: rule.selectorText || '', style, order });
    }
    let vars: string[] | null = null;
    for (let i = 0; i < style.length; i++) {
      const prop = style[i];
      if (prop.startsWith('--')) (vars ??= []).push(prop);
    }
    if (!vars) return;
    // Naive comma split — token declarations virtually never use selector
    // lists with nested commas (`:is(a, b)`), and a bad split only costs a
    // phantom inactive scope.
    const parts = (rule.selectorText || '').split(',').map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
      let seen = varsBySel.get(part);
      if (!seen) { seen = new Set(); varsBySel.set(part, seen); }
      for (const cssVar of vars) {
        seen.add(cssVar);
        const value = style.getPropertyValue(cssVar).trim();
        let list = declsByVar.get(cssVar);
        if (!list) { list = []; declsByVar.set(cssVar, list); }
        list.push({ value, order, scopeSel: part });
      }
    }
  });

  styleRulesCache = styleRules;

  // Classify after the walk — a scope's kind depends on how many tokens it
  // declares in total, which isn't known until every rule has been seen.
  const scopeBySel = new Map<string, TokenScope>();
  for (const [sel, vars] of varsBySel) scopeBySel.set(sel, buildScope(sel, vars.size));

  // Rank scopes so the panel opens on the one that actually themes the
  // page: active first, then the richest token set (a 327-var theme beats
  // a 5-var component scope), then the later declaration.
  const scopeWeight = (sel: string): number => {
    const scope = scopeBySel.get(sel)!;
    return (scope.active ? 1_000_000 : 0) + (varsBySel.get(sel)?.size ?? 0);
  };
  const primarySel = (decls: Declaration[]): string => {
    let best = decls[0];
    let bestWeight = scopeWeight(best.scopeSel);
    for (const d of decls) {
      const w = scopeWeight(d.scopeSel);
      if (w > bestWeight || (w === bestWeight && d.order >= best.order)) { best = d; bestWeight = w; }
    }
    return best.scopeSel;
  };

  // Resolving a token means reading it off an element inside its scope;
  // cache one computed style per scope rather than per (scope, token).
  const csCache = new Map<string, CSSStyleDeclaration | null>();
  const scopeStyles = (sel: string): CSSStyleDeclaration | null => {
    if (!csCache.has(sel)) {
      const el = getScopeElement(sel);
      csCache.set(sel, el ? getComputedStyle(el) : null);
    }
    return csCache.get(sel)!;
  };

  const tokens: PageToken[] = [];
  const byVar = new Map<string, PageToken>();
  const systemHits = new Map<DesignSystemId, number>();

  for (const [cssVar, decls] of declsByVar) {
    const primary = primarySel(decls);
    const byScope = new Map<string, Declaration>();
    for (const d of decls) {
      // Later declaration wins within a scope.
      const prev = byScope.get(d.scopeSel);
      if (!prev || d.order >= prev.order) byScope.set(d.scopeSel, d);
    }
    const variants: TokenVariant[] = [];
    for (const [sel, d] of byScope) {
      const scope = scopeBySel.get(sel)!;
      const resolved = scope.active ? (scopeStyles(sel)?.getPropertyValue(cssVar).trim() || '') : '';
      variants.push({ scope, value: d.value || resolved, resolvedValue: resolved });
    }
    const primaryVariant = variants.find(v => v.scope.selector === primary)!;
    if (!primaryVariant.value) continue;
    const system = systemFor(cssVar);
    if (system) systemHits.set(system, (systemHits.get(system) || 0) + 1);
    const token: PageToken = {
      cssVar,
      value: primaryVariant.value,
      resolvedValue: primaryVariant.resolvedValue,
      group: classifyToken(cssVar, primaryVariant.resolvedValue || primaryVariant.value, system),
      usageCount: 0,
      scope: primaryVariant.scope,
      scopes: variants.map(v => v.scope.selector),
      variants,
      system: system ?? undefined,
    };
    tokens.push(token);
    byVar.set(cssVar, token);
  }

  // Only surface systems with enough hits to be a real profile; strip the
  // label from tokens whose "system" never cleared the threshold (avoids
  // e.g. three coincidental --color-* vars branding a page as Tailwind).
  const systems: DesignSystemProfile[] = [];
  for (const r of SYSTEM_RULES) {
    const hits = systemHits.get(r.id) || 0;
    if (hits >= r.minHits) systems.push({ id: r.id, label: r.label, tokenCount: hits });
  }
  const confirmed = new Set(systems.map(s => s.id));
  for (const t of tokens) {
    if (t.system && !confirmed.has(t.system)) t.system = undefined;
  }

  countUsages(tokens);

  return {
    tokens,
    systems,
    byVar,
    scopes: Array.from(scopeBySel.values()),
    scannedAt: Date.now(),
  };
}
