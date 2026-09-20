import { splitSelectorList } from './inspect-states';

export type AuthoredSizeKind =
  | 'auto'
  | 'px'
  | 'percent'
  | 'length'
  | 'intrinsic'
  | 'calc'
  | 'var'
  | 'unknown';

export type SizeMode = 'fixed' | 'hug' | 'fill' | 'auto' | 'unknown';

export type AuthoredDimension = {
  authored: string | null;
  computed: string;
  kind: AuthoredSizeKind;
  mode: SizeMode;
  known: boolean;
  important: boolean;
};

export type CascadeDecl = {
  property: 'width' | 'height';
  value: string;
  important: boolean;
  spec: [number, number, number];
  order: number;
  origin: 'author' | 'inline';
  layerIndex: number | null;
  unsupported: boolean;
};

export type SizeFieldView = {
  mode: SizeMode;
  displayValue: string;
  displayUnit: string;
  writeUnit: string;
  editable: boolean;
  computedHint: string;
  authoredText: string | null;
  known: boolean;
};

const MAX_RULES = 50_000;
const SIZE_PROPS = ['width', 'height'] as const;
const LOGICAL_SIZE_PROPS = [
  'inline-size',
  'block-size',
  'min-inline-size',
  'max-inline-size',
  'min-block-size',
  'max-block-size',
] as const;
const FILL_VALUES = new Set(['100%', 'stretch', '-webkit-fill-available', '-moz-available']);
const HUG_VALUES = new Set(['fit-content', 'max-content', 'min-content']);
const CSS_WIDE = new Set(['inherit', 'unset', 'revert', 'revert-layer', 'initial']);

export function unknownDimension(computed = ''): AuthoredDimension {
  return {
    authored: null,
    computed,
    kind: 'unknown',
    mode: 'unknown',
    known: false,
    important: false,
  };
}

export function classifyAuthoredValue(value: string): AuthoredSizeKind {
  const v = (value || '').trim();
  if (!v) return 'unknown';
  const lower = v.toLowerCase();
  if (lower === 'auto') return 'auto';
  if (CSS_WIDE.has(lower)) return 'unknown';
  if (HUG_VALUES.has(lower) || lower.startsWith('fit-content(')) return 'intrinsic';
  if (lower === 'stretch' || lower === '-webkit-fill-available' || lower === '-moz-available') return 'intrinsic';
  if (/\bvar\s*\(/i.test(v)) return 'var';
  if (/\bcalc\s*\(/i.test(v) || /\bclamp\s*\(/i.test(v) || /\bminmax\s*\(/i.test(v)) return 'calc';
  if (/\bmin\s*\(/i.test(v) || /\bmax\s*\(/i.test(v)) return 'calc';
  const m = v.match(/^(-?[\d.]+(?:[eE][-+]?\d+)?)\s*(px|rem|em|%|vw|vh|vmin|vmax|ch|ex|cqw|cqh|cqi|cqb|lvw|lvh|svw|svh|dvw|dvh)?$/i);
  if (!m) return 'unknown';
  const unit = (m[2] || '').toLowerCase();
  if (unit === '%') return 'percent';
  if (unit === 'px' || unit === '') return 'px';
  return 'length';
}

export function sizeModeFromValue(value: string): SizeMode {
  const v = (value || '').trim().toLowerCase();
  if (!v) return 'unknown';
  if (v === 'auto') return 'auto';
  if (HUG_VALUES.has(v) || v.startsWith('fit-content(')) return 'hug';
  if (FILL_VALUES.has(v)) return 'fill';
  const kind = classifyAuthoredValue(value);
  if (kind === 'px' || kind === 'percent' || kind === 'length') return 'fixed';
  return 'unknown';
}

export function authoredDimensionFromValue(
  value: string,
  computed: string,
  known: boolean,
  important = false,
): AuthoredDimension {
  const authored = (value || '').trim() || null;
  const kind = authored ? classifyAuthoredValue(authored) : 'unknown';
  const mode = authored && known ? sizeModeFromValue(authored) : 'unknown';
  return { authored, computed: computed || '', kind, mode, known, important };
}

export function specBeats(a: [number, number, number], b: [number, number, number]): boolean {
  if (a[0] !== b[0]) return a[0] > b[0];
  if (a[1] !== b[1]) return a[1] > b[1];
  return a[2] > b[2];
}

function layerKey(d: CascadeDecl): number {
  if (d.layerIndex == null) return d.important ? -1 : 1_000_000;
  return d.important ? 100_000 - d.layerIndex : d.layerIndex;
}

function spec4(d: CascadeDecl): [number, number, number, number] {
  return [d.origin === 'inline' ? 1 : 0, d.spec[0], d.spec[1], d.spec[2]];
}

export function declBeats(a: CascadeDecl, b: CascadeDecl): boolean {
  if (a.important !== b.important) return a.important;
  const la = layerKey(a);
  const lb = layerKey(b);
  if (la !== lb) return la > lb;
  const sa = spec4(a);
  const sb = spec4(b);
  for (let i = 0; i < 4; i++) if (sa[i] !== sb[i]) return sa[i] > sb[i];
  return a.order >= b.order;
}

export function pickWinner(decls: CascadeDecl[]): CascadeDecl | null {
  let win: CascadeDecl | null = null;
  for (const d of decls) {
    if (!win || declBeats(d, win)) win = d;
  }
  return win;
}

export function authoredDimensionFromWinner(
  winner: CascadeDecl | null,
  computed: string,
  opts: { inaccessible: boolean; truncated: boolean },
): AuthoredDimension {
  const computedVal = computed || '';
  if (opts.truncated) return unknownDimension(computedVal);
  if (opts.inaccessible) {
    if (winner && winner.origin === 'inline' && winner.important) {
      return authoredDimensionFromValue(winner.value, computedVal, true, true);
    }
    return unknownDimension(computedVal);
  }
  if (!winner) return authoredDimensionFromValue('auto', computedVal, true, false);
  if (winner.unsupported) return unknownDimension(computedVal);
  return authoredDimensionFromValue(winner.value, computedVal, true, winner.important);
}

export function resolveAuthoredDimensions(input: {
  widthDecls: CascadeDecl[];
  heightDecls: CascadeDecl[];
  computedWidth: string;
  computedHeight: string;
  inaccessible: boolean;
  truncated: boolean;
}): { width: AuthoredDimension; height: AuthoredDimension } {
  const flags = { inaccessible: input.inaccessible, truncated: input.truncated };
  return {
    width: authoredDimensionFromWinner(pickWinner(input.widthDecls), input.computedWidth, flags),
    height: authoredDimensionFromWinner(pickWinner(input.heightDecls), input.computedHeight, flags),
  };
}

function readBalanced(s: string, start: number): { inner: string; end: number } {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') {
      depth--;
      if (depth === 0) return { inner: s.slice(start + 1, i), end: i + 1 };
    }
  }
  return { inner: s.slice(start + 1), end: s.length };
}

function consumeIdent(s: string, i: number): { ident: string; i: number } {
  const start = i;
  while (i < s.length && /[A-Za-z0-9_-]/.test(s[i])) i++;
  return { ident: s.slice(start, i), i };
}

export function specificityTuple(selector: string): [number, number, number] {
  let a = 0;
  let b = 0;
  let c = 0;
  const s = selector || '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '#' && i + 1 < s.length && /[A-Za-z0-9_-]/.test(s[i + 1])) {
      i++;
      i = consumeIdent(s, i).i;
      a++;
      continue;
    }
    if (ch === '.' && i + 1 < s.length && /[A-Za-z0-9_-]/.test(s[i + 1])) {
      i++;
      i = consumeIdent(s, i).i;
      b++;
      continue;
    }
    if (ch === '[') {
      const { end } = readBalanced(s, i);
      i = end;
      b++;
      continue;
    }
    if (ch === ':' && s[i + 1] === ':') {
      i += 2;
      i = consumeIdent(s, i).i;
      c++;
      continue;
    }
    if (ch === ':') {
      i++;
      const name = consumeIdent(s, i);
      i = name.i;
      const lower = name.ident.toLowerCase();
      if (lower === 'where' || lower === 'is' || lower === 'not' || lower === 'has') {
        if (s[i] === '(') {
          const { inner, end } = readBalanced(s, i);
          i = end;
          if (lower !== 'where') {
            let max: [number, number, number] = [0, 0, 0];
            for (const part of splitSelectorList(inner)) {
              const t = specificityTuple(part);
              if (specBeats(t, max)) max = t;
            }
            a += max[0];
            b += max[1];
            c += max[2];
          }
        }
        continue;
      }
      if (s[i] === '(') {
        const { inner, end } = readBalanced(s, i);
        i = end;
        const ofMatch = inner.match(/\sof\s+(.+)$/i);
        if (ofMatch) {
          const t = specificityTuple(ofMatch[1]);
          a += t[0];
          b += t[1];
          c += t[2];
        }
      }
      b++;
      continue;
    }
    if (ch === '*' || ch === '>' || ch === '+' || ch === '~' || ch === ',' || ch === '|') {
      i++;
      continue;
    }
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      i = consumeIdent(s, i).i;
      c++;
      continue;
    }
    i++;
  }
  return [a, b, c];
}

function parseNumeric(val: string): { num: number; unit: string } | null {
  const m = (val || '').trim().match(/^(-?[\d.]+(?:[eE][-+]?\d+)?)\s*(px|rem|em|%|vw|vh|vmin|vmax|ch|ex|cqw|cqh|cqi|cqb|lvw|lvh|svw|svh|dvw|dvh)?$/i);
  if (!m) return null;
  return { num: parseFloat(m[1]), unit: (m[2] || '').toLowerCase() };
}

function computedHint(computed: string): string {
  const p = parseNumeric(computed);
  if (!p) return (computed || '').trim();
  const n = Math.round(p.num * 100) / 100;
  return String(n === 0 ? 0 : n) + (p.unit || 'px');
}

export function sizeFieldView(input: {
  dim?: AuthoredDimension | null;
  override?: string | null;
  computed: string;
}): SizeFieldView {
  const computed = input.computed || input.dim?.computed || '';
  const hint = computedHint(computed);
  const override = (input.override || '').trim();
  const dim = input.dim;

  let authored: string | null;
  let known: boolean;
  if (override) {
    authored = override;
    known = true;
  } else if (dim && dim.known) {
    authored = dim.authored;
    known = true;

  } else {
    return {
      mode: 'unknown',
      displayValue: '—',
      displayUnit: hint || 'px',
      writeUnit: 'px',
      editable: false,
      computedHint: hint,
      authoredText: null,
      known: false,
    };
  }

  const mode = authored ? sizeModeFromValue(authored) : 'unknown';

  if (mode === 'fixed' && authored) {
    const parsed = parseNumeric(authored);
    if (parsed) {
      const unit = parsed.unit || 'px';
      return {
        mode,
        displayValue: String(parsed.num),
        displayUnit: unit,
        writeUnit: unit,
        editable: true,
        computedHint: hint,
        authoredText: authored,
        known,
      };
    }
  }

  return {
    mode,
    displayValue: authored || '—',
    displayUnit: hint || '',
    writeUnit: 'px',
    editable: false,
    computedHint: hint,
    authoredText: authored,
    known,
  };
}

type StyleLike = {
  length: number;
  item(index: number): string | null;
  getPropertyValue(name: string): string;
  getPropertyPriority(name: string): string;
};

function readSizeDecls(style: StyleLike): Array<{ property: 'width' | 'height'; value: string; important: boolean }> {
  const out: Array<{ property: 'width' | 'height'; value: string; important: boolean }> = [];
  for (const property of SIZE_PROPS) {
    const value = (style.getPropertyValue(property) || '').trim();
    if (!value) continue;
    out.push({
      property,
      value,
      important: style.getPropertyPriority(property) === 'important',
    });
  }
  return out;
}

function firstLogicalSize(style: StyleLike): { value: string; important: boolean } | null {
  for (const property of LOGICAL_SIZE_PROPS) {
    const value = (style.getPropertyValue(property) || '').trim();
    if (!value) continue;
    return { value, important: style.getPropertyPriority(property) === 'important' };
  }
  return null;
}

function isOwnSheet(sheet: CSSStyleSheet): boolean {
  const node = sheet.ownerNode;
  if (!node) return false;
  if (typeof Element !== 'undefined' && node instanceof Element) {
    const id = node.id || '';
    return id.startsWith('dm-') && id !== 'dm-applied-styles';
  }
  return false;
}

function ctorName(rule: object): string {
  const ctor = (rule as { constructor?: { name?: string } }).constructor;
  return ctor?.name || '';
}

function isCtor(rule: object, name: string, ctor: unknown): boolean {
  if (ctorName(rule) === name) return true;
  return typeof ctor === 'function' && rule instanceof (ctor as new (...args: never[]) => object);
}

function mediaMatches(query: string, matchMediaFn: (q: string) => boolean): boolean | 'unknown' {
  const q = (query || '').trim();
  if (!q || q.toLowerCase() === 'all') return true;
  try {
    return matchMediaFn(q);
  } catch {
    return 'unknown';
  }
}

function sheetMediaText(sheet: CSSStyleSheet): string {
  const media = sheet.media as unknown;
  if (!media) return '';
  if (typeof media === 'string') return media;
  return String((media as MediaList).mediaText || '');
}

function sheetApplies(sheet: CSSStyleSheet, matchMediaFn: (q: string) => boolean): boolean | 'unknown' {
  if (sheet.disabled) return false;
  return mediaMatches(sheetMediaText(sheet), matchMediaFn);
}

function supportsMatches(condition: string): boolean | 'unknown' {
  if (!condition) return true;
  try {
    if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
      if (CSS.supports(condition)) return true;
      const wrapped = condition.startsWith('(') ? condition : '(' + condition + ')';
      if (CSS.supports(wrapped)) return true;
      return false;
    }
  } catch {}
  return 'unknown';
}

function isShadowRootNode(root: object | null | undefined): boolean {
  if (!root) return false;
  if (typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot) return true;
  return ctorName(root) === 'ShadowRoot';
}

function pushSheetList(into: CSSStyleSheet[], list: ArrayLike<CSSStyleSheet> | null | undefined): void {
  if (!list) return;
  for (let i = 0; i < list.length; i++) into.push(list[i]);
}

export function collectScopedSheets(el: { getRootNode: () => object }): {
  sheets: CSSStyleSheet[];
  inaccessible: boolean;
} {
  const sheets: CSSStyleSheet[] = [];
  let inaccessible = false;
  try {
    const root = el.getRootNode() as {
      styleSheets?: ArrayLike<CSSStyleSheet>;
      adoptedStyleSheets?: ArrayLike<CSSStyleSheet>;
    };
    const knownRoot = isShadowRootNode(root)
      || (typeof Document !== 'undefined' && root instanceof Document)
      || (root && typeof root === 'object' && 'styleSheets' in root);
    if (!knownRoot) {
      return { sheets, inaccessible: true };
    }
    pushSheetList(sheets, root.styleSheets);
    try { pushSheetList(sheets, root.adoptedStyleSheets); }
    catch { inaccessible = true; }
  } catch {
    inaccessible = true;
  }
  return { sheets, inaccessible };
}

export type HarvestEnv = {
  sheets: ArrayLike<CSSStyleSheet>;
  matches: (selector: string) => boolean;
  matchMedia: (query: string) => boolean;
  inlineStyle?: StyleLike | null;
  inaccessible?: boolean;
};

export function harvestSizeDecls(env: HarvestEnv): {
  widthDecls: CascadeDecl[];
  heightDecls: CascadeDecl[];
  inaccessible: boolean;
  truncated: boolean;
} {
  const widthDecls: CascadeDecl[] = [];
  const heightDecls: CascadeDecl[] = [];
  let inaccessible = !!env.inaccessible;
  let truncated = false;
  let order = 0;
  const layerOrder = new Map<string, number>();

  const layerIndexOf = (path: string | null): number | null => {
    if (!path) return null;
    if (!layerOrder.has(path)) layerOrder.set(path, layerOrder.size);
    return layerOrder.get(path)!;
  };

  const registerTopLevelLayers = (names: string[]) => {
    for (const raw of names) {
      const n = raw.trim();
      if (!n || n.includes('.')) continue;
      layerIndexOf(n);
    }
  };

  const pushDecl = (
    property: 'width' | 'height',
    value: string,
    important: boolean,
    spec: [number, number, number],
    origin: 'author' | 'inline',
    layerPath: string | null,
    unsupported: boolean,
  ) => {
    const decl: CascadeDecl = {
      property,
      value,
      important,
      spec,
      order: order++,
      origin,
      layerIndex: layerIndexOf(layerPath),
      unsupported,
    };
    (property === 'width' ? widthDecls : heightDecls).push(decl);
  };

  const harvestStyle = (
    style: StyleLike,
    spec: [number, number, number],
    origin: 'author' | 'inline',
    layerPath: string | null,
    unsupported: boolean,
  ) => {
    const logical = firstLogicalSize(style);
    const flagged = unsupported || !!logical;
    const seen = new Set<'width' | 'height'>();
    for (const d of readSizeDecls(style)) {
      seen.add(d.property);
      pushDecl(d.property, d.value, d.important, spec, origin, layerPath, flagged);
    }
    if (!logical) return;
    if (!seen.has('width')) {
      pushDecl('width', logical.value, logical.important, spec, origin, layerPath, true);
    }
    if (!seen.has('height')) {
      pushDecl('height', logical.value, logical.important, spec, origin, layerPath, true);
    }
  };

  const nestedRules = (rule: object): CSSRuleList | undefined =>
    (rule as { cssRules?: CSSRuleList }).cssRules;

  const walk = (
    rules: CSSRuleList,
    layerPath: string | null,
    unsupported: boolean,
    ancestorMatched = false,
  ): void => {
    for (let i = 0; i < rules.length; i++) {
      if (order >= MAX_RULES) {
        truncated = true;
        return;
      }
      const rule = rules[i];
      const name = ctorName(rule);

      if (name === 'CSSLayerStatementRule') {
        if (layerPath) continue;
        const raw = (rule as CSSRule & { nameList?: string[]; name?: string }).nameList
          || String((rule as CSSRule).cssText || '').replace(/^@layer\s+/, '').replace(/;+\s*$/, '');
        const names = Array.isArray(raw) ? raw : String(raw).split(',');
        registerTopLevelLayers(names);
        continue;
      }

      if (name === 'CSSLayerBlockRule') {
        const layerName = String((rule as CSSRule & { name?: string }).name || '').trim();
        const inner = nestedRules(rule);
        if (layerPath || layerName.includes('.')) {
          if (inner) walk(inner, layerPath, true, ancestorMatched);
          continue;
        }
        const path = layerName || ('#anon' + order);
        layerIndexOf(path);
        if (inner) walk(inner, path, unsupported, ancestorMatched);
        continue;
      }

      if (name === 'CSSNestedDeclarations') {
        const style = (rule as CSSStyleRule).style;
        if (style && ancestorMatched) harvestStyle(style, [0, 0, 0], 'author', layerPath, true);
        continue;
      }

      if (isCtor(rule, 'CSSStyleRule', typeof CSSStyleRule === 'undefined' ? undefined : CSSStyleRule)) {
        const selectorText = (rule as CSSStyleRule).selectorText || '';
        const style = (rule as CSSStyleRule).style;
        const nested = nestedRules(rule);
        if (!selectorText || /&/.test(selectorText)) {
          if (style && ancestorMatched) harvestStyle(style, [0, 0, 0], 'author', layerPath, true);
          if (nested && nested.length) walk(nested, layerPath, true, ancestorMatched);
          continue;
        }
        const parts = splitSelectorList(selectorText);
        let hit = false;
        for (const part of parts) {
          if (/::/.test(part)) continue;
          let partHit = false;
          try { partHit = env.matches(part); } catch { partHit = false; }
          if (!partHit) continue;
          hit = true;
          harvestStyle(style, specificityTuple(part), 'author', layerPath, unsupported);
        }
        if (nested && nested.length) walk(nested, layerPath, true, ancestorMatched || hit);
        continue;
      }

      if (isCtor(rule, 'CSSMediaRule', typeof CSSMediaRule === 'undefined' ? undefined : CSSMediaRule)) {
        const matched = mediaMatches((rule as CSSMediaRule).conditionText || '', env.matchMedia);
        if (matched === false) continue;
        const inner = nestedRules(rule);
        if (inner) walk(inner, layerPath, unsupported || matched === 'unknown', ancestorMatched);
        continue;
      }

      if (isCtor(rule, 'CSSSupportsRule', typeof CSSSupportsRule === 'undefined' ? undefined : CSSSupportsRule)) {
        const condition = (rule as CSSConditionRule).conditionText || '';
        const matched = supportsMatches(condition);
        if (matched === false) continue;
        const inner = nestedRules(rule);
        if (inner) walk(inner, layerPath, unsupported || matched === 'unknown', ancestorMatched);
        continue;
      }

      if (name === 'CSSContainerRule' || name === 'CSSScopeRule' || name === 'CSSStartingStyleRule') {
        const inner = nestedRules(rule);
        if (inner) walk(inner, layerPath, true, ancestorMatched);
        continue;
      }

      const inner = nestedRules(rule);
      if (inner) walk(inner, layerPath, true, ancestorMatched);
    }
  };

  for (let i = 0; i < env.sheets.length; i++) {
    const sheet = env.sheets[i];
    if (isOwnSheet(sheet)) continue;
    const applies = sheetApplies(sheet, env.matchMedia);
    if (applies === false) continue;
    try {
      const rules = sheet.cssRules;
      if (rules) walk(rules, null, applies === 'unknown');
    } catch {
      inaccessible = true;
    }
  }

  if (env.inlineStyle) {
    harvestStyle(env.inlineStyle, [0, 0, 0], 'inline', null, false);
  }

  return { widthDecls, heightDecls, inaccessible, truncated };
}

export function inspectAuthoredSizing(el: HTMLElement): { width: AuthoredDimension; height: AuthoredDimension } {
  const cs = window.getComputedStyle(el);
  const scoped = collectScopedSheets(el);
  const harvested = harvestSizeDecls({
    sheets: scoped.sheets,
    matches: (selector) => {
      try { return el.matches(selector); } catch { return false; }
    },
    matchMedia: (query) => window.matchMedia(query).matches,
    inlineStyle: el.style,
    inaccessible: scoped.inaccessible,
  });
  return resolveAuthoredDimensions({
    widthDecls: harvested.widthDecls,
    heightDecls: harvested.heightDecls,
    computedWidth: cs.width,
    computedHeight: cs.height,
    inaccessible: harvested.inaccessible,
    truncated: harvested.truncated,
  });
}
