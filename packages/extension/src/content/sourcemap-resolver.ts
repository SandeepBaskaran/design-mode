// ============================================================
// Source Map v3 resolution: base64 VLQ decoding, generated →
// original position lookup, and loading of .map payloads from
// same-origin resources or inline data: URIs. Also refines React
// dev _debugSource reports, which are positions in the bundler's
// intermediate module, not the authored file. Every failure
// path returns null — never throws into callers.
// ============================================================

import { MANAGED_SHEET_ATTR } from '@shared/constants';

export const MAX_MAP_BYTES = 5 * 1024 * 1024;
export const MAP_TIMEOUT_MS = 5000;

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = new Int8Array(128).fill(-1);
for (let i = 0; i < B64_CHARS.length; i++) B64_LOOKUP[B64_CHARS.charCodeAt(i)] = i;

export interface MappingSegment {
  genLine: number;
  genCol: number;
  srcIdx?: number;
  srcLine?: number;
  srcCol?: number;
  nameIdx?: number;
}

export interface DecodedSourceMap {
  version: number;
  file?: string;
  sourceRoot?: string;
  sources: Array<string | null>;
  names: string[];
  segments: MappingSegment[];
}

export interface SourcemapHit {
  file: string;
  line: number;
  column: number;
  component?: string;
}

interface FetchResponseLike {
  ok: boolean;
  headers: { get(name: string): string | null };
  body?: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }> } } | null;
  text(): Promise<string>;
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<FetchResponseLike>;

export interface LoadSourceMapOptions {
  pageOrigin?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  maxBytes?: number;
}

// Tabs live long and resolve many resources; the per-URL caches are capped
// and refresh-on-hit so a hot resource is never evicted by scan volume.
const CACHE_MAX_ENTRIES = 32;

class LruCache<T> {
  private entries = new Map<string, T>();

  constructor(private readonly max: number) {}

  get(key: string): T | undefined {
    const value = this.entries.get(key);
    if (value !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, value);
    }
    return value;
  }

  set(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.max) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}

const resourceTextCache = new LruCache<string | null>(CACHE_MAX_ENTRIES);
const mapCache = new LruCache<DecodedSourceMap | null>(CACHE_MAX_ENTRIES);

// ── VLQ + decoding ──

export function decodeVLQ(segment: string): number[] {
  const values: number[] = [];
  let value = 0;
  let shift = 0;
  for (let i = 0; i < segment.length; i++) {
    const code = segment.charCodeAt(i);
    const digit = code < 128 ? B64_LOOKUP[code] : -1;
    if (digit < 0) throw new Error(`invalid base64 VLQ digit: ${segment[i]}`);
    value += (digit & 31) << shift;
    if ((digit & 32) === 0) {
      const negative = value & 1;
      value >>>= 1;
      values.push(negative ? -value : value);
      value = 0;
      shift = 0;
    } else {
      shift += 5;
      if (shift > 30) throw new Error('VLQ value too large');
    }
  }
  if (shift !== 0) throw new Error('dangling VLQ continuation');
  return values;
}

export function decodeMappings(mappings: string): MappingSegment[] {
  const segments: MappingSegment[] = [];
  let genLine = 0;
  let srcIdx = 0;
  let srcLine = 0;
  let srcCol = 0;
  let nameIdx = 0;
  for (const line of mappings.split(';')) {
    let genCol = 0;
    for (const raw of line.split(',')) {
      if (!raw) continue;
      const fields = decodeVLQ(raw);
      if (fields.length !== 1 && fields.length < 4) throw new Error(`unexpected segment arity ${fields.length}`);
      genCol += fields[0];
      if (fields.length === 1) {
        segments.push({ genLine, genCol });
        continue;
      }
      srcIdx += fields[1];
      srcLine += fields[2];
      srcCol += fields[3];
      const seg: MappingSegment = { genLine, genCol, srcIdx, srcLine, srcCol };
      if (fields.length >= 5) {
        nameIdx += fields[4];
        seg.nameIdx = nameIdx;
      }
      segments.push(seg);
    }
    genLine++;
  }
  return segments;
}

export function decodeSourceMap(json: string): DecodedSourceMap | null {
  try {
    const raw: unknown = JSON.parse(json);
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    if (obj.version !== 3) return null;
    if (!Array.isArray(obj.sources) || typeof obj.mappings !== 'string') return null;
    const sources = obj.sources.map(s => (typeof s === 'string' ? s : null));
    const names = Array.isArray(obj.names) ? obj.names.filter((n): n is string => typeof n === 'string') : [];
    return {
      version: 3,
      ...(typeof obj.file === 'string' ? { file: obj.file } : {}),
      ...(typeof obj.sourceRoot === 'string' && obj.sourceRoot !== '' ? { sourceRoot: obj.sourceRoot } : {}),
      sources,
      names,
      segments: decodeMappings(obj.mappings),
    };
  } catch {
    return null;
  }
}

// ── Position lookup ──

export function originalPositionFor(map: DecodedSourceMap, genLine: number, genCol: number): SourcemapHit | null {
  const segments = map.segments;
  let lo = 0;
  let hi = segments.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const seg = segments[mid];
    const cmp = seg.genLine - genLine || seg.genCol - genCol;
    if (cmp <= 0) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (best < 0) return null;
  const seg = segments[best];
  if (seg.genLine !== genLine) return null;
  if (seg.srcIdx === undefined) return null;
  const source = map.sources[seg.srcIdx];
  if (!source) return null;
  const name = seg.nameIdx !== undefined ? map.names[seg.nameIdx] : undefined;
  return {
    file: joinSourceRoot(map.sourceRoot, source),
    line: seg.srcLine ?? 0,
    column: seg.srcCol ?? 0,
    ...(name ? { component: name } : {}),
  };
}

export function joinSourceRoot(root: string | undefined, source: string): string {
  if (!root) return source;
  if (root.endsWith('/') || source.startsWith('/')) return root + source;
  return `${root}/${source}`;
}

// ── sourceMappingURL handling ──

export function parseSourceMappingURL(text: string): string | null {
  const re = /\/\/[#@]\s*sourceMappingURL=(\S+)|\/\*[#@]\s*sourceMappingURL=([^\s*]+)\s*\*\//g;
  let last: string | null = null;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    last = m[1] ?? m[2] ?? null;
  }
  return last;
}

export function resolveMapURL(target: string, resourceUrl: string | null): string | null {
  if (target.startsWith('data:')) return target;
  if (!resourceUrl) return null;
  try {
    return new URL(target, resourceUrl).toString();
  } catch {
    return null;
  }
}

// ── Fetching ──

function defaultFetch(): FetchLike {
  return ((url: string, init?: { signal?: AbortSignal }) => fetch(url, init)) as FetchLike;
}

async function readCapped(res: FetchResponseLike, cap: number): Promise<string | null> {
  const declared = res.headers.get('content-length');
  if (declared && Number(declared) > cap) return null;
  const reader = res.body?.getReader?.();
  if (!reader) {
    const text = await res.text();
    return text.length > cap ? null : text;
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  const decoder = new TextDecoder();
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    if (chunk.value) {
      size += chunk.value.length;
      if (size > cap) return null;
      chunks.push(chunk.value);
    }
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  return decoder.decode(bytes);
}

function decodeDataURI(uri: string): string | null {
  try {
    const comma = uri.indexOf(',');
    if (comma < 0) return null;
    const meta = uri.slice(5, comma);
    const payload = uri.slice(comma + 1);
    if (/(^|;)base64($|;)/.test(meta)) {
      const binary = atob(payload);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    }
    return decodeURIComponent(payload);
  } catch {
    return null;
  }
}

export async function loadSourceMap(mapRef: string, opts: LoadSourceMapOptions = {}): Promise<DecodedSourceMap | null> {
  try {
    if (mapRef.startsWith('data:')) {
      return decodeSourceMap(decodeDataURI(mapRef) ?? '');
    }
    let parsed: URL;
    try {
      parsed = new URL(mapRef);
    } catch {
      return null;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!opts.pageOrigin || parsed.origin !== opts.pageOrigin) return null;
    const cached = mapCache.get(mapRef);
    if (cached !== undefined) return cached;
    const doFetch = opts.fetchImpl ?? defaultFetch();
    const res = await doFetch(mapRef, { signal: AbortSignal.timeout(opts.timeoutMs ?? MAP_TIMEOUT_MS) });
    const text = res.ok ? await readCapped(res, opts.maxBytes ?? MAX_MAP_BYTES) : null;
    const map = text === null ? null : decodeSourceMap(text);
    mapCache.set(mapRef, map);
    return map;
  } catch {
    return null;
  }
}

export async function fetchResourceText(url: string, opts: LoadSourceMapOptions): Promise<string | null> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!opts.pageOrigin || parsed.origin !== opts.pageOrigin) return null;
    const cached = resourceTextCache.get(url);
    if (cached !== undefined) return cached;
    const doFetch = opts.fetchImpl ?? defaultFetch();
    const res = await doFetch(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? MAP_TIMEOUT_MS) });
    const text = res.ok ? await readCapped(res, opts.maxBytes ?? MAX_MAP_BYTES) : null;
    resourceTextCache.set(url, text);
    return text;
  } catch {
    return null;
  }
}

// ── React dev source refinement ──

// Dev-mode JSX transforms (esbuild jsxDev, babel jsx-development) bake each
// element's intermediate position into its jsxDEV call as a trailing
// { fileName, lineNumber, columnNumber } literal. React's _debugSource
// reports that intermediate position verbatim, so the literal — not the
// reported position — is the reliable key for finding the generated position
// to map back to the authored file. Plain string search only: the reported
// values are page-supplied and must never become a RegExp.
export function findSourceObjectOffset(
  text: string,
  file: string,
  line: number,
  column?: number,
): number {
  if (!file || !Number.isSafeInteger(line) || line < 0) return -1;
  for (const needle of [`lineNumber: ${line}`, `lineNumber:${line}`]) {
    let from = 0;
    for (let idx = text.indexOf(needle, from); idx >= 0; idx = text.indexOf(needle, from)) {
      from = idx + needle.length;
      const after = text.charCodeAt(from);
      if (after >= 48 && after <= 57) continue; // prefix hit: 27 inside 271
      if (!sourceObjectMatchesFile(text, idx, file)) continue;
      if (column != null && !sourceObjectMatchesColumn(text, from, column)) continue;
      return idx;
    }
  }
  return -1;
}

function sourceObjectMatchesFile(text: string, idx: number, file: string): boolean {
  const anchor = text.lastIndexOf('fileName', idx);
  if (anchor < 0 || idx - anchor > 500) return false;
  const colon = text.indexOf(':', anchor);
  if (colon < 0 || colon > idx) return false;
  let i = colon + 1;
  while (i < idx && (text[i] === ' ' || text[i] === '\t')) i++;
  const quote = text[i];
  if (quote !== '"' && quote !== "'") return false;
  const end = text.indexOf(quote, i + 1);
  if (end < 0 || end > idx) return false;
  const value = text.slice(i + 1, end);
  return value === file || value.endsWith(file) || file.endsWith(value);
}

function sourceObjectMatchesColumn(text: string, from: number, column: number): boolean {
  const tail = text.slice(from, from + 80);
  const anchor = tail.indexOf('columnNumber');
  if (anchor < 0) return false;
  const colon = tail.indexOf(':', anchor);
  if (colon < 0) return false;
  const digits = /^\s*(\d+)/.exec(tail.slice(colon + 1));
  return digits !== null && Number(digits[1]) === column;
}

// React dev builds report _debugSource positions from the bundler's
// intermediate module (react-refresh preamble etc.), so the authored line is
// not recoverable from the report alone. When the served module publishes a
// source map, the intermediate position lives on as the baked literal above;
// locate it, treat its location as the generated position, and map it to the
// authored one. Returns null whenever any step is unavailable — the caller
// keeps React's raw report rather than a guessed correction.
export async function refineReactSourcePosition(
  reported: { file: string; line: number; column?: number },
  opts: LoadSourceMapOptions & { moduleUrl?: string | null } = {},
): Promise<SourcemapHit | null> {
  try {
    const moduleUrl = opts.moduleUrl;
    if (!moduleUrl) return null;
    const pageOrigin = opts.pageOrigin ?? (typeof location !== 'undefined' ? location.origin : undefined);
    const text = await fetchResourceText(moduleUrl, { ...opts, pageOrigin });
    if (text === null) return null;
    const target = parseSourceMappingURL(text);
    if (!target) return null;
    const mapRef = resolveMapURL(target, moduleUrl);
    if (!mapRef) return null;
    const map = await loadSourceMap(mapRef, { ...opts, pageOrigin });
    if (!map) return null;
    const idx = findSourceObjectOffset(text, reported.file, reported.line, reported.column);
    if (idx < 0) return null;
    const { line, column } = lineColumnAt(text, idx);
    return originalPositionFor(map, line, column);
  } catch {
    return null;
  }
}

// ── DOM: element → matched CSS rule → original position ──

// A sheet DIVE injected itself (marked at creation) is never authored
// source: its rules shadow the authored ones only because the extension
// appends late, so reading them as source starves the resolver before any
// .map fetch.
export function isManagedSheet(sheet: { ownerNode?: unknown }): boolean {
  const node = sheet.ownerNode as { hasAttribute?: (name: string) => boolean } | null | undefined;
  return typeof node?.hasAttribute === 'function' && node.hasAttribute(MANAGED_SHEET_ATTR);
}

function walkCssRules(list: ArrayLike<unknown>, fn: (rule: unknown) => void): void {
  for (let i = 0; i < list.length; i++) {
    const rule = list[i];
    fn(rule);
    const nested = (rule as { cssRules?: ArrayLike<unknown> }).cssRules;
    if (nested) walkCssRules(nested, fn);
  }
}

interface MatchedRule {
  rule: { selectorText: string; style: { getPropertyValue(name: string): string } };
  sheet: RuleSheet;
  matchIndex: number;
}

interface RuleSheet {
  ownerNode?: unknown;
  href?: string | null;
  cssRules: ArrayLike<unknown>;
}

export function pickSourceRule(
  sheets: ArrayLike<RuleSheet>,
  el: { matches(selector: string): boolean },
  property?: string,
): MatchedRule | null {
  let declaring: MatchedRule | null = null;
  let matching: MatchedRule | null = null;
  for (let s = 0; s < sheets.length; s++) {
    const sheet = sheets[s];
    if (isManagedSheet(sheet)) continue;
    let count = 0;
    let rules: ArrayLike<unknown>;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    walkCssRules(rules, raw => {
      const selector = (raw as { selectorText?: unknown }).selectorText;
      if (typeof selector !== 'string') return;
      const style = (raw as { style?: { getPropertyValue?: unknown } }).style;
      if (typeof style?.getPropertyValue !== 'function') return;
      try {
        if (!el.matches(selector)) return;
      } catch {
        return;
      }
      count++;
      const hit = { rule: { selectorText: selector, style: style as { getPropertyValue(name: string): string } }, sheet, matchIndex: count - 1 };
      matching = hit;
      if (property && (style as { getPropertyValue(name: string): string }).getPropertyValue(property) !== '') declaring = hit;
    });
  }
  return declaring ?? matching;
}

function lastMatchingRule(el: HTMLElement, property?: string): MatchedRule | null {
  return pickSourceRule(document.styleSheets, el, property);
}

function locateSelector(text: string, selector: string, occurrence: number): number {
  let idx = -1;
  let from = 0;
  for (let i = 0; i <= occurrence; i++) {
    idx = text.indexOf(selector, from);
    if (idx < 0) break;
    from = idx + 1;
  }
  if (idx >= 0) return idx;
  const flexible = selector
    .trim()
    .split(/\s+/)
    .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  if (!flexible) return -1;
  const re = new RegExp(flexible, 'g');
  for (let i = 0; i <= occurrence; i++) {
    const m = re.exec(text);
    if (!m) return -1;
    idx = m.index;
  }
  return idx;
}

function lineColumnAt(text: string, offset: number): { line: number; column: number } {
  let line = 0;
  let lastNewline = -1;
  for (let i = 0; i < offset; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lastNewline = i;
    }
  }
  return { line, column: offset - lastNewline - 1 };
}

async function stylesheetText(sheet: RuleSheet, opts: LoadSourceMapOptions): Promise<{ text: string; url: string | null } | null> {
  const node = sheet.ownerNode as { textContent?: string } | null;
  if (!sheet.href) {
    const text = node?.textContent ?? '';
    return text ? { text, url: null } : null;
  }
  const text = await fetchResourceText(sheet.href, opts);
  return text === null ? null : { text, url: sheet.href };
}

export async function resolveViaSourceMaps(
  el: HTMLElement,
  opts: LoadSourceMapOptions & { property?: string } = {},
): Promise<SourcemapHit | null> {
  try {
    if (typeof document === 'undefined') return null;
    const pageOrigin = opts.pageOrigin ?? (typeof location !== 'undefined' ? location.origin : undefined);
    const matched = lastMatchingRule(el, opts.property);
    if (!matched) return null;
    const sheet = await stylesheetText(matched.sheet, { ...opts, pageOrigin });
    if (!sheet) return null;
    const idx = locateSelector(sheet.text, matched.rule.selectorText, matched.matchIndex);
    if (idx < 0) return null;
    const { line, column } = lineColumnAt(sheet.text, idx);
    const target = parseSourceMappingURL(sheet.text);
    if (!target) return null;
    const mapRef = resolveMapURL(target, sheet.url);
    if (!mapRef) return null;
    const map = await loadSourceMap(mapRef, { ...opts, pageOrigin });
    if (!map) return null;
    return originalPositionFor(map, line, column);
  } catch {
    return null;
  }
}
