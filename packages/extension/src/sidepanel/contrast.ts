// WCAG contrast checker — pure utilities. No DOM, no chrome APIs.
// Consumed by the inline colour picker to show a live ratio + rating
// + AA/AAA pass-fail badge.

export type Category = 'auto' | 'large' | 'normal' | 'graphics';
export type ResolvedCategory = 'large' | 'normal' | 'graphics';
export type Level = 'AA' | 'AAA';
export type Rating = 'excellent' | 'good' | 'poor' | 'very-poor';

export type Rgb = [number, number, number];
export type Rgba = [number, number, number, number];

const LARGE_TEXT_PX_REGULAR = 24;     // 18pt ≈ 24px
const LARGE_TEXT_PX_BOLD = 18.66;     // 14pt ≈ 18.66px
const BOLD_WEIGHT_FLOOR = 700;

function srgbChannel(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b);
}

// Composite a foreground colour with alpha over an opaque background.
// Returns a fully-opaque RGB triple suitable for luminance/contrast.
export function blendOver(fg: Rgba, bg: Rgb): Rgb {
  const a = Math.max(0, Math.min(1, fg[3]));
  return [
    Math.round(fg[0] * a + bg[0] * (1 - a)),
    Math.round(fg[1] * a + bg[1] * (1 - a)),
    Math.round(fg[2] * a + bg[2] * (1 - a)),
  ];
}

export function contrastRatio(fg: Rgb, bg: Rgb): number {
  const lf = relativeLuminance(fg);
  const lb = relativeLuminance(bg);
  const hi = Math.max(lf, lb);
  const lo = Math.min(lf, lb);
  const r = (hi + 0.05) / (lo + 0.05);
  return Math.round(r * 100) / 100;
}

const TEXT_PROPS = new Set(['color', '__textshadow_color']);
const GRAPHICS_PROPS_HINTS = ['fill', 'stroke', '__stroke_color', 'accentColor', 'caretColor'];

function looksLikeGraphics(prop: string): boolean {
  if (GRAPHICS_PROPS_HINTS.includes(prop)) return true;
  if (prop.startsWith('__fill_color__')) return true;
  if (prop.startsWith('__fill_stop_color__')) return true;
  if (prop.startsWith('__stroke_color__')) return true;
  return false;
}

export function resolveCategory(
  category: Category,
  prop: string,
  fontSizePx: number,
  fontWeight: number,
): ResolvedCategory {
  if (category !== 'auto') return category;
  if (looksLikeGraphics(prop)) return 'graphics';
  if (!TEXT_PROPS.has(prop)) return 'graphics';
  if (!fontSizePx) return 'normal';
  if (fontSizePx >= LARGE_TEXT_PX_REGULAR) return 'large';
  if (fontSizePx >= LARGE_TEXT_PX_BOLD && fontWeight >= BOLD_WEIGHT_FLOOR) return 'large';
  return 'normal';
}

export function thresholdFor(resolved: ResolvedCategory, level: Level): number {
  if (resolved === 'normal') return level === 'AAA' ? 7 : 4.5;
  return level === 'AAA' ? 4.5 : 3;
}

export function ratingFor(ratio: number): Rating {
  if (ratio >= 7) return 'excellent';
  if (ratio >= 4.5) return 'good';
  if (ratio >= 3) return 'poor';
  return 'very-poor';
}

export const RATING_META: Record<Rating, { label: string; description: string; cssVar: string }> = {
  excellent: {
    label: 'Excellent',
    description: 'All colours meet the highest accessibility standards, passing WCAG AA (4.5:1) and AAA (7:1) contrast requirements. Your design is fully optimised for readability and inclusivity.',
    cssVar: '--dm-rating-excellent',
  },
  good: {
    label: 'Good',
    description: 'Colours meet the minimum WCAG AA standard (4.5:1), ensuring sufficient readability for most users. Your design is accessible but could be improved for enhanced clarity.',
    cssVar: '--dm-rating-good',
  },
  poor: {
    label: 'Poor',
    description: 'Colours only meet the basic contrast ratio (3:1), which is the absolute minimum for certain UI elements. This may cause readability issues for some users.',
    cssVar: '--dm-rating-poor',
  },
  'very-poor': {
    label: 'Very Poor',
    description: 'Colours fail all accessibility standards, making text difficult or impossible to read for many users. Immediate improvements are needed to ensure usability.',
    cssVar: '--dm-rating-very-poor',
  },
};

export const CATEGORY_LABEL: Record<ResolvedCategory, string> = {
  large: 'Large text',
  normal: 'Normal text',
  graphics: 'Graphics',
};

export interface EvaluateInput {
  fg: Rgba;
  bg: Rgb;
  category: Category;
  level: Level;
  prop: string;
  fontSizePx: number;
  fontWeight: number;
}

export interface EvaluateResult {
  ratio: number;
  threshold: number;
  pass: boolean;
  resolvedCategory: ResolvedCategory;
  rating: Rating;
}

export function evaluate(input: EvaluateInput): EvaluateResult {
  const blended = blendOver(input.fg, input.bg);
  const ratio = contrastRatio(blended, input.bg);
  const resolved = resolveCategory(input.category, input.prop, input.fontSizePx, input.fontWeight);
  const threshold = thresholdFor(resolved, input.level);
  return {
    ratio,
    threshold,
    pass: ratio >= threshold,
    resolvedCategory: resolved,
    rating: ratingFor(ratio),
  };
}

// Parse a CSS colour value into an opaque-or-alpha RGBA tuple.
// Accepts: #rgb / #rgba / #rrggbb / #rrggbbaa, rgb(r,g,b), rgba(r,g,b,a),
// rgb(r g b), rgb(r g b / a), and 'transparent'. Alpha may be a decimal
// (0..1) or a percentage (e.g. '50%'). Channels may also be percentages
// (e.g. 'rgb(50% 50% 50%)'). Returns null on unrecognised input — named
// colours, hsl(), lab(), oklch(), var(...) etc. Callers should normalise
// those via the browser before calling this (see normaliseToRgba in
// sidepanel.ts).
export function parseRgba(value: string): Rgba | null {
  const v = (value || '').trim();
  if (!v) return null;
  if (v === 'transparent') return [0, 0, 0, 0];
  if (v[0] === '#') {
    const hex = v.slice(1);
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
        1,
      ];
    }
    if (/^[0-9a-fA-F]{4}$/.test(hex)) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
        parseInt(hex[3] + hex[3], 16) / 255,
      ];
    }
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
        1,
      ];
    }
    if (/^[0-9a-fA-F]{8}$/.test(hex)) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
        parseInt(hex.slice(6, 8), 16) / 255,
      ];
    }
    return null;
  }
  // Accept both rgb(r, g, b[, a]) and the CSS Color Level 4 form
  // rgb(r g b[ / a]) returned by recent Chrome's getComputedStyle.
  const fn = v.match(/^rgba?\(\s*(.+?)\s*\)$/i);
  if (!fn) return null;
  const inside = fn[1];
  // Split on either commas OR whitespace (treat any run of separators as one).
  // The optional alpha is positionally last and may be separated by a slash
  // in the space-form (rgb(0 0 0 / 0.5)).
  let parts: string[];
  if (inside.includes(',')) {
    parts = inside.split(',').map(p => p.trim());
  } else {
    const slashSplit = inside.split('/');
    const rgbParts = slashSplit[0].trim().split(/\s+/);
    parts = slashSplit.length > 1 ? [...rgbParts, slashSplit[1].trim()] : rgbParts;
  }
  if (parts.length < 3 || parts.length > 4) return null;
  const num = (s: string, max = 255): number => {
    const t = s.trim();
    if (t.endsWith('%')) return Math.round((parseFloat(t) / 100) * max);
    return parseFloat(t);
  };
  const r = num(parts[0]);
  const g = num(parts[1]);
  const b = num(parts[2]);
  let a = 1;
  if (parts[3] !== undefined) {
    const t = parts[3].trim();
    a = t.endsWith('%') ? parseFloat(t) / 100 : parseFloat(t);
  }
  if (!isFinite(r) || !isFinite(g) || !isFinite(b) || !isFinite(a)) return null;
  return [r, g, b, a];
}

// ── oklab / oklch → sRGB ──
// CSS Color Level 4. Math from the spec (https://www.w3.org/TR/css-color-4/).
// We do the conversion ourselves so it works regardless of browser version
// and regardless of whether the canvas 2D context accepts these formats.
//
// Pipeline: oklch → oklab (polar to rect) → linear sRGB → sRGB (gamma).
// Inputs are clamped to a sensible range; out-of-sRGB-gamut colours get
// gamut-clipped to [0, 255] per channel (acceptable approximation for a
// contrast checker — full gamut mapping is overkill).
function num(s: string, max = 1): number {
  const t = s.trim();
  if (t.endsWith('%')) return parseFloat(t) / 100 * max;
  return parseFloat(t);
}

function oklabToSrgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  const toSrgb = (c: number) => {
    const clamped = Math.max(0, Math.min(1, c));
    return clamped <= 0.0031308
      ? 12.92 * clamped
      : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  };
  return [
    Math.round(toSrgb(lr) * 255),
    Math.round(toSrgb(lg) * 255),
    Math.round(toSrgb(lb) * 255),
  ];
}

// Parses oklab(L a b[ / A]) — both space-separated form. L accepts % or 0-1.
// a / b can be raw numbers or %; in CSS spec, % maps to -0.4..+0.4 range.
export function parseOklab(value: string): Rgba | null {
  const v = (value || '').trim();
  const m = v.match(/^oklab\(\s*(.+?)\s*\)$/i);
  if (!m) return null;
  const parts = m[1].split('/');
  const triplet = parts[0].trim().split(/\s+/);
  if (triplet.length !== 3) return null;
  const L = num(triplet[0]);
  const ab = (s: string) => s.trim().endsWith('%') ? parseFloat(s) / 100 * 0.4 : parseFloat(s);
  const a = ab(triplet[1]);
  const b = ab(triplet[2]);
  const alpha = parts[1] !== undefined ? num(parts[1]) : 1;
  if (!isFinite(L) || !isFinite(a) || !isFinite(b) || !isFinite(alpha)) return null;
  const [r, g, bl] = oklabToSrgb(L, a, b);
  return [r, g, bl, alpha];
}

// Parses oklch(L C h[ / A]) — polar form. Converts (C, h) → (a, b) then
// reuses oklabToSrgb. h is degrees by default; supports rad/grad/turn units.
export function parseOklch(value: string): Rgba | null {
  const v = (value || '').trim();
  const m = v.match(/^oklch\(\s*(.+?)\s*\)$/i);
  if (!m) return null;
  const parts = m[1].split('/');
  const triplet = parts[0].trim().split(/\s+/);
  if (triplet.length !== 3) return null;
  const L = num(triplet[0]);
  const C = triplet[1].trim().endsWith('%') ? parseFloat(triplet[1]) / 100 * 0.4 : parseFloat(triplet[1]);
  const hRaw = triplet[2].trim();
  let hDeg: number;
  if (hRaw.endsWith('rad')) hDeg = parseFloat(hRaw) * 180 / Math.PI;
  else if (hRaw.endsWith('grad')) hDeg = parseFloat(hRaw) * 0.9;
  else if (hRaw.endsWith('turn')) hDeg = parseFloat(hRaw) * 360;
  else hDeg = parseFloat(hRaw); // 'deg' or unitless
  const alpha = parts[1] !== undefined ? num(parts[1]) : 1;
  if (!isFinite(L) || !isFinite(C) || !isFinite(hDeg) || !isFinite(alpha)) return null;
  const hRad = hDeg * Math.PI / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);
  const [r, g, bl] = oklabToSrgb(L, a, b);
  return [r, g, bl, alpha];
}

export function isTransparent(value: string): boolean {
  const t = (value || '').trim();
  if (!t) return true;
  if (t === 'transparent') return true;
  if (t === 'rgba(0, 0, 0, 0)' || t === 'rgba(0,0,0,0)') return true;
  const parsed = parseRgba(t);
  return parsed ? parsed[3] === 0 : false;
}
