// ============================================================
// Design Mode — Layout Guides overlay (session-only)
// ============================================================
//
// Side panel sends SET_LAYOUT_GUIDES with a JSON array of layers per
// element. We translate that into a `::before` pseudo-element rule
// stacked in our own stylesheet (`<style id="dm-layout-guides">`) —
// kept separate from the main override sheet so Layout Guides never
// land in the Changes tab or in session-persisted styleChanges.
//
// Memory is per-content-script session: we hold a Map<elementId, layers>
// and the side panel re-pushes from its own map on every selection,
// which means a page reload (content script reloads) clears the
// overlay but the side panel's session memory keeps its config.

interface LayoutGuideLayer {
  kind: 'grid' | 'columns' | 'rows';
  count: number;
  color: string;
  opacity: number;
  visible: boolean;
  align: string;
  size: string;
  margin: string;
  gutter: string;
}

const guideLayersByElement = new Map<string, LayoutGuideLayer[]>();
// Per-element section-wide hide flag. Stored separately from the layer
// array so the user's config survives a "section eye off" toggle: the
// overlay clears but the rows stay intact when they toggle it back on.
const guidesSectionHidden = new Set<string>();
let guideStyleEl: HTMLStyleElement | null = null;

function ensureGuideStyleEl(): HTMLStyleElement {
  if (guideStyleEl && guideStyleEl.isConnected) return guideStyleEl;
  const existing = document.getElementById('dm-layout-guides') as HTMLStyleElement | null;
  if (existing) { guideStyleEl = existing; return existing; }
  const el = document.createElement('style');
  el.id = 'dm-layout-guides';
  (document.head || document.documentElement).appendChild(el);
  guideStyleEl = el;
  return el;
}

function parseGuideLayers(value: unknown): LayoutGuideLayer[] {
  if (!value || value === 'none') return [];
  if (typeof value === 'string') {
    try {
      const arr = JSON.parse(value);
      if (!Array.isArray(arr)) return [];
      return arr.filter((l: any) => l && l.kind);
    } catch { return []; }
  }
  if (Array.isArray(value)) {
    return value.filter((l: any) => l && l.kind);
  }
  return [];
}

function colorWithAlpha(hex: string, opacityPct: number): string {
  // Accept '#rgb', '#rrggbb', 'rgb(...)', 'rgba(...)' or 'var(...)'.
  // For non-hex inputs we wrap via color-mix to compose opacity safely.
  const a = Math.max(0, Math.min(100, opacityPct)) / 100;
  const m3 = hex.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (m3) {
    const r = parseInt(m3[1] + m3[1], 16);
    const g = parseInt(m3[2] + m3[2], 16);
    const b = parseInt(m3[3] + m3[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  const m6 = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (m6) {
    return `rgba(${parseInt(m6[1], 16)}, ${parseInt(m6[2], 16)}, ${parseInt(m6[3], 16)}, ${a})`;
  }
  return `color-mix(in srgb, ${hex} ${Math.round(a * 100)}%, transparent)`;
}

function pxNumber(value: string, fallback: number): number {
  const n = parseFloat(value);
  return isFinite(n) ? n : fallback;
}

// Build a linear-gradient string for one axis of one layer. The pattern
// is `transparent → color (track-start..track-end) → transparent gutter`
// repeated `count` times, optionally aligned to one edge or centered.
function buildAxisGradient(
  dir: 'to right' | 'to bottom',
  layer: LayoutGuideLayer,
): string {
  const tinted = colorWithAlpha(layer.color, layer.opacity);
  const count = Math.max(1, Math.min(50, layer.count | 0));
  const margin = pxNumber(layer.margin, 0);
  const gutter = pxNumber(layer.gutter, 0);
  const align = layer.align || 'stretch';

  if (align === 'stretch') {
    const stops: string[] = [`transparent 0`, `transparent ${margin}px`];
    for (let i = 0; i < count; i++) {
      const trackStart = `calc(${margin}px + ${i} * ((100% - ${2 * margin}px - ${(count - 1) * gutter}px) / ${count} + ${gutter}px))`;
      const trackEnd = `calc(${margin}px + ${i + 1} * ((100% - ${2 * margin}px - ${(count - 1) * gutter}px) / ${count}) + ${i} * ${gutter}px)`;
      stops.push(`${tinted} ${trackStart}`);
      stops.push(`${tinted} ${trackEnd}`);
      if (i < count - 1) {
        const gutterEnd = `calc(${margin}px + ${i + 1} * ((100% - ${2 * margin}px - ${(count - 1) * gutter}px) / ${count} + ${gutter}px))`;
        stops.push(`transparent ${trackEnd}`);
        stops.push(`transparent ${gutterEnd}`);
      }
    }
    stops.push(`transparent 100%`);
    return `linear-gradient(${dir}, ${stops.join(', ')})`;
  }

  const size = pxNumber(layer.size, 80);
  const fromStart = align === 'left' || align === 'top';
  if (align === 'center') {
    const totalW = count * size + (count - 1) * gutter;
    const stops: string[] = [`transparent 0`];
    for (let i = 0; i < count; i++) {
      const trackStart = `calc(50% - ${totalW / 2}px + ${i * (size + gutter)}px)`;
      const trackEnd = `calc(50% - ${totalW / 2}px + ${i * (size + gutter) + size}px)`;
      stops.push(`transparent ${trackStart}`);
      stops.push(`${tinted} ${trackStart}`);
      stops.push(`${tinted} ${trackEnd}`);
      stops.push(`transparent ${trackEnd}`);
    }
    stops.push(`transparent 100%`);
    return `linear-gradient(${dir}, ${stops.join(', ')})`;
  }
  if (fromStart) {
    const stops: string[] = [`transparent 0`];
    for (let i = 0; i < count; i++) {
      const trackStart = `${margin + i * (size + gutter)}px`;
      const trackEnd = `${margin + i * (size + gutter) + size}px`;
      stops.push(`transparent ${trackStart}`);
      stops.push(`${tinted} ${trackStart}`);
      stops.push(`${tinted} ${trackEnd}`);
      stops.push(`transparent ${trackEnd}`);
    }
    stops.push(`transparent 100%`);
    return `linear-gradient(${dir}, ${stops.join(', ')})`;
  }
  const stops: string[] = [`transparent 0`];
  for (let i = 0; i < count; i++) {
    const trackEnd = `calc(100% - ${margin + i * (size + gutter)}px)`;
    const trackStart = `calc(100% - ${margin + i * (size + gutter) + size}px)`;
    stops.push(`transparent ${trackStart}`);
    stops.push(`${tinted} ${trackStart}`);
    stops.push(`${tinted} ${trackEnd}`);
    stops.push(`transparent ${trackEnd}`);
  }
  stops.push(`transparent 100%`);
  return `linear-gradient(${dir}, ${stops.join(', ')})`;
}

function buildElementCss(elementId: string, layers: LayoutGuideLayer[]): string {
  const visible = layers.filter(l => l.visible !== false);
  if (!visible.length) return '';
  const gradients: string[] = [];
  for (const l of visible) {
    if (l.kind === 'columns') gradients.push(buildAxisGradient('to right', l));
    else if (l.kind === 'rows') gradients.push(buildAxisGradient('to bottom', l));
    else if (l.kind === 'grid') {
      gradients.push(buildAxisGradient('to right', l));
      gradients.push(buildAxisGradient('to bottom', l));
    }
  }
  if (!gradients.length) return '';
  // position: relative is needed for the absolutely-positioned ::before
  // to anchor against the element's box. !important so we win over the
  // page's static positioning; absolutely-positioned children may need
  // the user to hide guides if their offsetParent chain breaks.
  return `[data-dm-id="${elementId}"][data-dm-id] {\n` +
    `  position: relative !important;\n` +
    `}\n` +
    `[data-dm-id="${elementId}"]::before {\n` +
    `  content: '' !important;\n` +
    `  position: absolute !important;\n` +
    `  inset: 0 !important;\n` +
    `  pointer-events: none !important;\n` +
    `  z-index: 2147483646 !important;\n` +
    `  background-image: ${gradients.join(', ')} !important;\n` +
    `  background-repeat: no-repeat !important;\n` +
    `  background-size: 100% 100% !important;\n` +
    `}`;
}

function rebuildSheet() {
  const el = ensureGuideStyleEl();
  const blocks: string[] = [];
  for (const [id, layers] of guideLayersByElement) {
    if (guidesSectionHidden.has(id)) continue;
    const css = buildElementCss(id, layers);
    if (css) blocks.push(css);
  }
  el.textContent = blocks.join('\n\n');
}

// Public API — called from index.ts message handlers.
// `layers` is the authoritative layer list (the side panel always
// sends the full config). `sectionVisible` is the section-level eye:
// when `false`, we stop painting but keep the layer data so the panel
// can restore the overlay on toggle-back-on.
export function setLayoutGuides(elementId: string, layers: unknown, sectionVisible?: boolean): void {
  const parsed = parseGuideLayers(layers);
  if (parsed.length === 0) guideLayersByElement.delete(elementId);
  else guideLayersByElement.set(elementId, parsed);
  if (sectionVisible === false) guidesSectionHidden.add(elementId);
  else if (sectionVisible === true) guidesSectionHidden.delete(elementId);
  rebuildSheet();
}

// Snapshot for the side panel — called from SELECT_ELEMENT / hover so
// the panel can hydrate its own map after a close/reopen.
export function getLayoutGuidesFor(elementId: string): { layers: LayoutGuideLayer[]; sectionVisible: boolean } | null {
  const layers = guideLayersByElement.get(elementId);
  if (!layers || !layers.length) return null;
  return { layers, sectionVisible: !guidesSectionHidden.has(elementId) };
}

export function clearAllLayoutGuides(): void {
  guideLayersByElement.clear();
  guidesSectionHidden.clear();
  rebuildSheet();
}
