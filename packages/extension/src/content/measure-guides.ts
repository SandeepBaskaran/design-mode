// ============================================================
// Design Mode — Measurement guides (VisBug-style)
// Axis lines on hover, edge-to-edge distance pills between two
// elements, and corner resize dots on the selected element.
// All overlays are session-only visual aids; only the resize
// *commit* persists (routed through the change-tracker by index.ts).
// ============================================================

import { Z_INDEX } from '../shared';
import { getElementRect, getElementById, type Rect } from './helpers';
import { showSelect, setOverlayTransitions } from './overlays';

const HOVER_COLOR = '#4F9EFF';
const SELECT_COLOR = '#FF6B35';
const MIN_GAP = 0.5;
const MIN_SIZE = 8;

// Resize commit is owned by index.ts (it holds the change-tracker import,
// the undo stack, and the panel-notify path). We just hand it the final
// border-box dimensions on mouseup.
type ResizeCommit = (elementId: string, width: string, height: string) => void;
let resizeCommit: ResizeCommit | null = null;
export function setResizeCommitHandler(fn: ResizeCommit) { resizeCommit = fn; }

// Live (uncommitted) dimensions during a drag — drives the side panel's W/H
// fields so they tick along with the resize. Throttled to one rAF per frame.
type ResizePreview = (elementId: string, width: string, height: string) => void;
let resizePreview: ResizePreview | null = null;
export function setResizePreviewHandler(fn: ResizePreview) { resizePreview = fn; }
let previewRaf = 0;
let pendingPreview: { id: string; w: string; h: string } | null = null;
function schedulePreview(id: string, w: string, h: string) {
  pendingPreview = { id, w, h };
  if (previewRaf) return;
  previewRaf = requestAnimationFrame(() => {
    previewRaf = 0;
    if (pendingPreview && resizePreview) resizePreview(pendingPreview.id, pendingPreview.w, pendingPreview.h);
    pendingPreview = null;
  });
}

let teardown = false;

let axisLayer: HTMLDivElement | null = null;
let distanceLayer: HTMLDivElement | null = null;
let dotsLayer: HTMLDivElement | null = null;
let resizeDotsForId: string | null = null;

function ensureLayer(current: HTMLDivElement | null, id: string): HTMLDivElement {
  if (current && current.isConnected) return current;
  const layer = document.createElement('div');
  layer.id = id;
  Object.assign(layer.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' });
  document.documentElement.appendChild(layer);
  return layer;
}

function docWidth(): number {
  return Math.max(document.documentElement.scrollWidth, window.innerWidth);
}
function docHeight(): number {
  return Math.max(document.documentElement.scrollHeight, window.innerHeight);
}

// ── Axis guide lines (full-document dashed lines at an element's edges) ──

export function showAxisGuides(rect: Rect, variant: 'hover' | 'select') {
  if (teardown) return;
  axisLayer = ensureLayer(axisLayer, 'dm-axis-guides');
  axisLayer.replaceChildren();
  const color = variant === 'select' ? SELECT_COLOR : HOVER_COLOR;
  const w = docWidth();
  const h = docHeight();
  for (const y of [rect.top, rect.bottom]) addLine(axisLayer, 0, y, w, y, color, true);
  for (const x of [rect.left, rect.right]) addLine(axisLayer, x, 0, x, h, color, true);
}

export function hideAxisGuides() {
  axisLayer?.replaceChildren();
}

// ── Distance measurement between two rects ──

export interface DistanceLine { x1: number; y1: number; x2: number; y2: number; }
export interface DistancePill { x: number; y: number; label: string; }
export interface DistanceSegments { lines: DistanceLine[]; pills: DistancePill[]; }

// Edge-offset measurement: an axis-aligned connector (x1,y1)→(x2,y2) with a
// centered pill, plus a dashed extension projecting the target edge to the
// connector at (extX,extY).
function offset(lines: DistanceLine[], pills: DistancePill[], x1: number, y1: number, x2: number, y2: number, extX: number, extY: number) {
  const dist = Math.abs(x2 - x1) + Math.abs(y2 - y1);
  if (dist < MIN_GAP) return;
  lines.push({ x1, y1, x2, y2 });
  pills.push({ x: (x1 + x2) / 2, y: (y1 + y2) / 2, label: String(Math.round(dist)) });
  if (Math.abs(extX - x2) + Math.abs(extY - y2) >= MIN_GAP) lines.push({ x1: x2, y1: y2, x2: extX, y2: extY });
}

// Pure geometry — no DOM. Returns axis-aligned connector lines + centered
// pills describing the gaps between rects `a` and `b` (document coords).
export function computeDistanceSegments(a: Rect, b: Rect): DistanceSegments {
  const lines: DistanceLine[] = [];
  const pills: DistancePill[] = [];
  const push = (x1: number, y1: number, x2: number, y2: number, val: number) => {
    if (Math.abs(val) < MIN_GAP) return;
    lines.push({ x1, y1, x2, y2 });
    pills.push({ x: (x1 + x2) / 2, y: (y1 + y2) / 2, label: String(Math.round(Math.abs(val))) });
  };

  const aInB = b.left <= a.left && b.right >= a.right && b.top <= a.top && b.bottom >= a.bottom;
  const bInA = a.left <= b.left && a.right >= b.right && a.top <= b.top && a.bottom >= b.bottom;

  if (aInB || bInA) {
    const outer = bInA ? a : b;
    const inner = bInA ? b : a;
    const cx = (inner.left + inner.right) / 2;
    const cy = (inner.top + inner.bottom) / 2;
    push(outer.left, cy, inner.left, cy, inner.left - outer.left);
    push(inner.right, cy, outer.right, cy, outer.right - inner.right);
    push(cx, outer.top, cx, inner.top, inner.top - outer.top);
    push(cx, inner.bottom, cx, outer.bottom, outer.bottom - inner.bottom);
    return { lines, pills };
  }

  const overlapX = a.left < b.right && b.left < a.right;
  const overlapY = a.top < b.bottom && b.top < a.bottom;

  if (overlapX && !overlapY) {
    const [upper, lower] = a.bottom <= b.top ? [a, b] : [b, a];
    const x = (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2;
    push(x, upper.bottom, x, lower.top, lower.top - upper.bottom);
    // Side offsets: how far a's vertical edges sit from b's, measured at a's
    // mid-height, with a dashed extension projecting b's edge to that line.
    const cy = (a.top + a.bottom) / 2;
    const bNearY = a.bottom <= b.top ? b.top : b.bottom;
    offset(lines, pills, a.left, cy, b.left, cy, b.left, bNearY);
    offset(lines, pills, a.right, cy, b.right, cy, b.right, bNearY);
    return { lines, pills };
  }

  if (overlapY && !overlapX) {
    const [leftR, rightR] = a.right <= b.left ? [a, b] : [b, a];
    const y = (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2;
    push(leftR.right, y, rightR.left, y, rightR.left - leftR.right);
    const cx = (a.left + a.right) / 2;
    const bNearX = a.right <= b.left ? b.left : b.right;
    offset(lines, pills, cx, a.top, cx, b.top, bNearX, b.top);
    offset(lines, pills, cx, a.bottom, cx, b.bottom, bNearX, b.bottom);
    return { lines, pills };
  }

  if (!overlapX && !overlapY) {
    // Diagonal — draw an L through the elbow facing the other box.
    const ax = a.right <= b.left ? a.right : a.left;
    const bx = a.right <= b.left ? b.left : b.right;
    const ay = a.bottom <= b.top ? a.bottom : a.top;
    const by = a.bottom <= b.top ? b.top : b.bottom;
    push(ax, ay, bx, ay, bx - ax);
    push(bx, ay, bx, by, by - ay);
    return { lines, pills };
  }

  // Partial overlap on both axes — show the four edge alignment offsets.
  const cx = (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2;
  const cy = (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2;
  push(a.left, cy, b.left, cy, b.left - a.left);
  push(a.right, cy, b.right, cy, b.right - a.right);
  push(cx, a.top, cx, b.top, b.top - a.top);
  push(cx, a.bottom, cx, b.bottom, b.bottom - a.bottom);
  return { lines, pills };
}

export function showDistance(base: Rect, target: Rect) {
  if (teardown) return;
  distanceLayer = ensureLayer(distanceLayer, 'dm-distance');
  distanceLayer.replaceChildren();
  paintSegments(distanceLayer, computeDistanceSegments(base, target));
}

export function hideDistance() {
  distanceLayer?.replaceChildren();
}

// Distances between consecutive elements (sorted top-then-left) in a
// multi-selection — mirrors VisBug's pairwise spacing readout.
export function showPairwiseDistances(ids: string[]) {
  if (teardown) return;
  distanceLayer = ensureLayer(distanceLayer, 'dm-distance');
  distanceLayer.replaceChildren();
  const rects = ids
    .map(getElementById)
    .filter((el): el is HTMLElement => !!el)
    .map(getElementRect)
    .sort((p, q) => (p.top - q.top) || (p.left - q.left));
  for (let i = 0; i < rects.length - 1; i++) {
    paintSegments(distanceLayer, computeDistanceSegments(rects[i], rects[i + 1]));
  }
}

// ── Resize dots (eight handles: four corners + four edge midpoints) ──

const midX = (r: Rect) => (r.left + r.right) / 2;
const midY = (r: Rect) => (r.top + r.bottom) / 2;
const HANDLES: Array<{ dir: string; cursor: string; hx: (r: Rect) => number; hy: (r: Rect) => number }> = [
  { dir: 'nw', cursor: 'nwse-resize', hx: r => r.left,  hy: r => r.top },
  { dir: 'n',  cursor: 'ns-resize',   hx: midX,         hy: r => r.top },
  { dir: 'ne', cursor: 'nesw-resize', hx: r => r.right, hy: r => r.top },
  { dir: 'e',  cursor: 'ew-resize',   hx: r => r.right, hy: midY },
  { dir: 'se', cursor: 'nwse-resize', hx: r => r.right, hy: r => r.bottom },
  { dir: 's',  cursor: 'ns-resize',   hx: midX,         hy: r => r.bottom },
  { dir: 'sw', cursor: 'nesw-resize', hx: r => r.left,  hy: r => r.bottom },
  { dir: 'w',  cursor: 'ew-resize',   hx: r => r.left,  hy: midY },
];

export function showResizeDots(el: HTMLElement) {
  if (teardown) return;
  resizeDotsForId = el.dataset.dmId || null;
  dotsLayer = ensureLayer(dotsLayer, 'dm-resize-dots');
  dotsLayer.replaceChildren();
  const rect = getElementRect(el);
  for (const h of HANDLES) {
    const dot = document.createElement('div');
    Object.assign(dot.style, {
      position: 'absolute',
      width: '9px', height: '9px',
      background: SELECT_COLOR, border: '1.5px solid #fff',
      borderRadius: '50%', boxSizing: 'border-box',
      cursor: h.cursor, pointerEvents: 'auto',
      zIndex: String(Z_INDEX.RESIZE_HANDLE),
      transform: 'translate(-50%, -50%)',
      top: h.hy(rect) + 'px', left: h.hx(rect) + 'px',
    });
    dot.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); startResize(el, h.dir, e); });
    dotsLayer.appendChild(dot);
  }
}

export function repositionResizeDots() {
  if (!resizeDotsForId || !dotsLayer) return;
  const el = getElementById(resizeDotsForId);
  if (!el) { hideResizeDots(); return; }
  const rect = getElementRect(el);
  const dots = dotsLayer.children;
  for (let i = 0; i < HANDLES.length && i < dots.length; i++) {
    const dot = dots[i] as HTMLElement;
    dot.style.top = HANDLES[i].hy(rect) + 'px';
    dot.style.left = HANDLES[i].hx(rect) + 'px';
  }
}

export function hideResizeDots() {
  resizeDotsForId = null;
  dotsLayer?.replaceChildren();
}

function startResize(el: HTMLElement, dir: string, e: MouseEvent) {
  const startRect = el.getBoundingClientRect();
  const cs = window.getComputedStyle(el);
  const borderBox = cs.boxSizing === 'border-box';
  // When box-sizing is content-box, style width/height exclude padding+border,
  // so subtract them to keep the rendered border-box matching the drag.
  const extraX = borderBox ? 0 : px(cs.paddingLeft) + px(cs.paddingRight) + px(cs.borderLeftWidth) + px(cs.borderRightWidth);
  const extraY = borderBox ? 0 : px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth);
  const startX = e.clientX, startY = e.clientY;
  const id = el.dataset.dmId || null;
  setOverlayTransitions(false); // track the cursor without the 80ms ease lag

  const onMove = (ev: MouseEvent) => {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    let w = startRect.width;
    let h = startRect.height;
    if (dir.includes('e')) w = startRect.width + dx;
    if (dir.includes('w')) w = startRect.width - dx;
    if (dir.includes('s')) h = startRect.height + dy;
    if (dir.includes('n')) h = startRect.height - dy;
    // Use !important so the live drag also overrides an existing tracked
    // resize rule (which itself is !important) — otherwise the second drag
    // of the same element appears frozen.
    if (dir.includes('e') || dir.includes('w')) el.style.setProperty('width', Math.max(MIN_SIZE, w - extraX) + 'px', 'important');
    if (dir.includes('n') || dir.includes('s')) el.style.setProperty('height', Math.max(MIN_SIZE, h - extraY) + 'px', 'important');
    const rect = getElementRect(el);
    showSelect(el);            // keeps the orange box + W×H label live
    showAxisGuides(rect, 'select');
    repositionResizeDots();
    // Push the live border-box dimensions to the side panel's W/H fields.
    if (id) schedulePreview(id, Math.round(rect.width) + 'px', Math.round(rect.height) + 'px');
  };

  const onUp = () => {
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('mouseup', onUp, true);
    setOverlayTransitions(true);
    hideAxisGuides();
    const width = el.style.getPropertyValue('width');
    const height = el.style.getPropertyValue('height');
    // Hand the final dimensions to the change-tracker (persist + export) and
    // drop the inline values we set during the drag so the tracked rule owns them.
    el.style.removeProperty('width');
    el.style.removeProperty('height');
    if (id && resizeCommit) resizeCommit(id, width, height);
    repositionResizeDots();
  };

  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('mouseup', onUp, true);
}

function px(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

// ── Rendering helpers ──

function addLine(layer: HTMLDivElement, x1: number, y1: number, x2: number, y2: number, color: string, dashed: boolean) {
  const line = document.createElement('div');
  const style = dashed ? 'dashed' : 'solid';
  if (y1 === y2) {
    Object.assign(line.style, {
      position: 'absolute', top: y1 + 'px', left: Math.min(x1, x2) + 'px',
      width: Math.abs(x2 - x1) + 'px', height: '0',
      borderTop: `1px ${style} ${color}`, pointerEvents: 'none',
    });
  } else {
    Object.assign(line.style, {
      position: 'absolute', left: x1 + 'px', top: Math.min(y1, y2) + 'px',
      height: Math.abs(y2 - y1) + 'px', width: '0',
      borderLeft: `1px ${style} ${color}`, pointerEvents: 'none',
    });
  }
  layer.appendChild(line);
}

function addPill(layer: HTMLDivElement, x: number, y: number, label: string) {
  const pill = document.createElement('div');
  Object.assign(pill.style, {
    position: 'absolute', top: y + 'px', left: x + 'px',
    transform: 'translate(-50%, -50%)',
    background: SELECT_COLOR, color: '#fff',
    fontSize: '10px', fontFamily: 'monospace', fontWeight: '600',
    padding: '1px 6px', borderRadius: '9999px',
    pointerEvents: 'none', whiteSpace: 'nowrap', lineHeight: '1.4',
    zIndex: String(Z_INDEX.SELECT_OVERLAY + 1),
  });
  pill.textContent = label;
  layer.appendChild(pill);
}

function paintSegments(layer: HTMLDivElement, seg: DistanceSegments) {
  for (const l of seg.lines) addLine(layer, l.x1, l.y1, l.x2, l.y2, SELECT_COLOR, true);
  for (const p of seg.pills) addPill(layer, p.x, p.y, p.label);
}

// ── Teardown ──

export function teardownMeasureGuides() {
  teardown = true;
  resizeDotsForId = null;
  [axisLayer, distanceLayer, dotsLayer].forEach(l => l?.remove());
  axisLayer = distanceLayer = dotsLayer = null;
}

export function resetMeasureTeardown() {
  teardown = false;
}
