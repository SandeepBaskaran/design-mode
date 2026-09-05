// Session-only computed flex/grid overlay. Separate from authored layout
// guides and the change-tracker. Teardown removes the host node.

export type OverlayBand = {
  kind: 'col' | 'row' | 'item';
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ComputedLayoutSnapshot = {
  display: string;
  flexDirection?: string;
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
  columnGap?: string;
  rowGap?: string;
  width: number;
  height: number;
};

export type ChildBox = { left: number; top: number; width: number; height: number };

const HOST_ID = 'dm-computed-layout';

export function isFlexOrGridDisplay(display: string): boolean {
  return /^(inline-)?(flex|grid)$/.test((display || '').trim());
}

export function splitTrackList(template: string): string[] {
  const raw = (template || '').trim();
  if (!raw || raw === 'none') return [];
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of raw) {
    if (ch === '(') depth++;
    else if (ch === ')' && depth > 0) depth--;
    if ((ch === ' ' || ch === '\t') && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function parsePx(value: string): number | null {
  const m = /^(-?[\d.]+)px$/.exec((value || '').trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  return isFinite(n) ? n : null;
}

export function trackSizesPx(tracks: string[], containerPx: number, gapPx: number): number[] {
  if (!tracks.length || containerPx <= 0) return [];
  const gapTotal = Math.max(0, tracks.length - 1) * Math.max(0, gapPx);
  const sizes = tracks.map(() => 0);
  let leftover = Math.max(0, containerPx - gapTotal);
  let frTotal = 0;
  const frIndex: number[] = [];
  tracks.forEach((t, i) => {
    const px = parsePx(t);
    if (px != null) {
      sizes[i] = px;
      leftover -= px;
      return;
    }
    const pct = /^(-?[\d.]+)%$/.exec(t.trim());
    if (pct) {
      sizes[i] = (parseFloat(pct[1]) / 100) * containerPx;
      leftover -= sizes[i];
      return;
    }
    const fr = /^(-?[\d.]+)fr$/.exec(t.trim());
    if (fr) {
      frTotal += Math.max(0, parseFloat(fr[1]));
      frIndex.push(i);
      return;
    }
    leftover -= 0;
  });
  leftover = Math.max(0, leftover);
  if (frIndex.length && frTotal > 0) {
    for (const i of frIndex) {
      const fr = parseFloat(tracks[i]);
      sizes[i] = leftover * (fr / frTotal);
    }
  } else if (frIndex.length) {
    const share = leftover / frIndex.length;
    for (const i of frIndex) sizes[i] = share;
  }
  return sizes.map((n) => Math.max(0, n));
}

export function bandsFromSnapshot(
  snap: ComputedLayoutSnapshot,
  childBoxes: ChildBox[] = [],
): OverlayBand[] {
  const display = (snap.display || '').trim();
  if (!isFlexOrGridDisplay(display)) return [];
  const bands: OverlayBand[] = [];
  const w = Math.max(0, snap.width);
  const h = Math.max(0, snap.height);
  if (/grid/.test(display)) {
    const colGap = parsePx(snap.columnGap || '0px') || 0;
    const rowGap = parsePx(snap.rowGap || '0px') || 0;
    const cols = trackSizesPx(splitTrackList(snap.gridTemplateColumns || ''), w, colGap);
    const rows = trackSizesPx(splitTrackList(snap.gridTemplateRows || ''), h, rowGap);
    let x = 0;
    for (let i = 0; i < cols.length; i++) {
      bands.push({ kind: 'col', x, y: 0, w: cols[i], h });
      x += cols[i] + colGap;
    }
    let y = 0;
    for (let i = 0; i < rows.length; i++) {
      bands.push({ kind: 'row', x: 0, y, w, h: rows[i] });
      y += rows[i] + rowGap;
    }
  }
  for (const box of childBoxes) {
    bands.push({
      kind: 'item',
      x: box.left,
      y: box.top,
      w: Math.max(0, box.width),
      h: Math.max(0, box.height),
    });
  }
  return bands;
}

function snapshotFromElement(el: HTMLElement): { snap: ComputedLayoutSnapshot; children: ChildBox[] } {
  const cs = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const snap: ComputedLayoutSnapshot = {
    display: cs.display || '',
    flexDirection: cs.flexDirection || '',
    gridTemplateColumns: cs.gridTemplateColumns || '',
    gridTemplateRows: cs.gridTemplateRows || '',
    columnGap: cs.columnGap || '',
    rowGap: cs.rowGap || '',
    width: rect.width,
    height: rect.height,
  };
  const children: ChildBox[] = [];
  for (const child of Array.from(el.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (child.id && child.id.startsWith('dm-')) continue;
    const r = child.getBoundingClientRect();
    children.push({
      left: r.left - rect.left,
      top: r.top - rect.top,
      width: r.width,
      height: r.height,
    });
  }
  return { snap, children };
}

let hostEl: HTMLDivElement | null = null;
let attachedEl: HTMLElement | null = null;
let onScroll: (() => void) | null = null;

function ensureHost(): HTMLDivElement {
  const existing = document.getElementById(HOST_ID) as HTMLDivElement | null;
  if (existing) { hostEl = existing; return existing; }
  const el = document.createElement('div');
  el.id = HOST_ID;
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483645;box-sizing:border-box;margin:0;padding:0;border:0;';
  (document.documentElement || document.body).appendChild(el);
  hostEl = el;
  return el;
}

function paint(el: HTMLElement): void {
  const host = ensureHost();
  const rect = el.getBoundingClientRect();
  host.style.left = rect.left + 'px';
  host.style.top = rect.top + 'px';
  host.style.width = rect.width + 'px';
  host.style.height = rect.height + 'px';
  const { snap, children } = snapshotFromElement(el);
  const bands = bandsFromSnapshot(snap, children);
  while (host.firstChild) host.removeChild(host.firstChild);
  for (const b of bands) {
    const piece = document.createElement('div');
    const color = b.kind === 'item'
      ? 'rgba(79, 158, 255, 0.18)'
      : b.kind === 'col'
        ? 'rgba(255, 107, 53, 0.10)'
        : 'rgba(124, 200, 134, 0.10)';
    const outline = b.kind === 'item'
      ? '1px solid rgba(79, 158, 255, 0.7)'
      : '1px dashed rgba(255, 255, 255, 0.35)';
    piece.style.cssText =
      `position:absolute;left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;` +
      `box-sizing:border-box;background:${color};outline:${outline};outline-offset:-1px;`;
    host.appendChild(piece);
  }
}

export function setComputedLayoutOverlay(el: HTMLElement | null): void {
  clearComputedLayoutOverlay();
  if (!el || !el.isConnected) return;
  const display = window.getComputedStyle(el).display || '';
  if (!isFlexOrGridDisplay(display)) return;
  attachedEl = el;
  paint(el);
  onScroll = () => { if (attachedEl && attachedEl.isConnected) paint(attachedEl); else clearComputedLayoutOverlay(); };
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onScroll);
}

export function clearComputedLayoutOverlay(): void {
  if (onScroll) {
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onScroll);
    onScroll = null;
  }
  attachedEl = null;
  const host = hostEl || document.getElementById(HOST_ID);
  if (host) host.remove();
  hostEl = null;
}
