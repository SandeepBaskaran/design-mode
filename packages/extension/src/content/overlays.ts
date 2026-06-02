// ============================================================
// Design Mode — Overlay Management (hover + selection highlights)
// ============================================================

import { Z_INDEX } from '../shared';
import { getElementRect, type Rect } from './helpers';

let hoverOverlay: HTMLDivElement | null = null;
let selectOverlay: HTMLDivElement | null = null;
let dimensionLabel: HTMLDivElement | null = null;
// Box-model band overlays — light red margin (outside the element box) and
// light green padding (inside the border, between border and content).
// One pair per outline (hover / select) so both can render at once when the
// user hovers a new element while another is selected.
let hoverMarginBand: HTMLDivElement | null = null;
let hoverPaddingBand: HTMLDivElement | null = null;
let selectMarginBand: HTMLDivElement | null = null;
let selectPaddingBand: HTMLDivElement | null = null;
// Set after destroyOverlays — prevents in-flight mouseover handlers from
// re-creating overlay elements via ensureOverlays() after the panel closed.
let teardown = false;

const OVERLAY_BASE = {
  position: 'absolute', pointerEvents: 'none', borderRadius: '2px',
  transition: 'all 80ms ease-out', display: 'none',
} as const;

// Box-model band colours. Painted as the band div's border (so a single
// div with asymmetric border widths matches asymmetric margins/paddings).
// Semi-transparent so page content underneath stays readable.
const HOVER_DEFAULT_HEX = '#4F9EFF';
const SELECT_DEFAULT_HEX = '#FF6B35';
const MARGIN_DEFAULT_HEX = '#FF6363';
const PADDING_DEFAULT_HEX = '#7CC886';
const MARGIN_BAND_ALPHA = 0.28;
const PADDING_BAND_ALPHA = 0.30;
const HOVER_FILL_ALPHA = 0.06;

let hoverHex = HOVER_DEFAULT_HEX;
let selectHex = SELECT_DEFAULT_HEX;
let marginBandHex = MARGIN_DEFAULT_HEX;
let paddingBandHex = PADDING_DEFAULT_HEX;
let hoverFillCss = hexToRgba(HOVER_DEFAULT_HEX, HOVER_FILL_ALPHA);
let marginBandCss = hexToRgba(MARGIN_DEFAULT_HEX, MARGIN_BAND_ALPHA);
let paddingBandCss = hexToRgba(PADDING_DEFAULT_HEX, PADDING_BAND_ALPHA);

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((hex || '').trim());
  if (!m) return `rgba(255, 99, 99, ${alpha})`;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function applyOverlayColors() {
  if (hoverOverlay) {
    hoverOverlay.style.borderColor = hoverHex;
    hoverOverlay.style.backgroundColor = hoverFillCss;
  }
  if (selectOverlay) selectOverlay.style.borderColor = selectHex;
  if (dimensionLabel) dimensionLabel.style.background = selectHex;
  if (hoverMarginBand) hoverMarginBand.style.borderColor = marginBandCss;
  if (hoverPaddingBand) hoverPaddingBand.style.borderColor = paddingBandCss;
  if (selectMarginBand) selectMarginBand.style.borderColor = marginBandCss;
  if (selectPaddingBand) selectPaddingBand.style.borderColor = paddingBandCss;
}

// Pull the user's overlay colour choices from chrome.storage.local on
// init, and stay in sync via chrome.storage.onChanged so flipping any
// swatch in Settings repaints live without a page reload. Side panel
// writes the same keys.
try {
  chrome.storage?.local?.get?.([
    'dm-inspector-hover-color', 'dm-inspector-select-color',
    'dm-overlay-margin-color', 'dm-overlay-padding-color',
  ], (r: any) => {
    if (typeof r?.['dm-inspector-hover-color'] === 'string') {
      hoverHex = r['dm-inspector-hover-color'];
      hoverFillCss = hexToRgba(hoverHex, HOVER_FILL_ALPHA);
    }
    if (typeof r?.['dm-inspector-select-color'] === 'string') {
      selectHex = r['dm-inspector-select-color'];
    }
    if (typeof r?.['dm-overlay-margin-color'] === 'string') {
      marginBandHex = r['dm-overlay-margin-color'];
      marginBandCss = hexToRgba(marginBandHex, MARGIN_BAND_ALPHA);
    }
    if (typeof r?.['dm-overlay-padding-color'] === 'string') {
      paddingBandHex = r['dm-overlay-padding-color'];
      paddingBandCss = hexToRgba(paddingBandHex, PADDING_BAND_ALPHA);
    }
    applyOverlayColors();
  });
  chrome.storage?.onChanged?.addListener?.((changes, area) => {
    if (area !== 'local') return;
    let touched = false;
    if (changes['dm-inspector-hover-color']) {
      hoverHex = changes['dm-inspector-hover-color'].newValue || HOVER_DEFAULT_HEX;
      hoverFillCss = hexToRgba(hoverHex, HOVER_FILL_ALPHA);
      touched = true;
    }
    if (changes['dm-inspector-select-color']) {
      selectHex = changes['dm-inspector-select-color'].newValue || SELECT_DEFAULT_HEX;
      touched = true;
    }
    if (changes['dm-overlay-margin-color']) {
      marginBandHex = changes['dm-overlay-margin-color'].newValue || MARGIN_DEFAULT_HEX;
      marginBandCss = hexToRgba(marginBandHex, MARGIN_BAND_ALPHA);
      touched = true;
    }
    if (changes['dm-overlay-padding-color']) {
      paddingBandHex = changes['dm-overlay-padding-color'].newValue || PADDING_DEFAULT_HEX;
      paddingBandCss = hexToRgba(paddingBandHex, PADDING_BAND_ALPHA);
      touched = true;
    }
    if (touched) applyOverlayColors();
  });
} catch {}

function makeBand(id: string, zIndex: number, color: string): HTMLDivElement {
  const el = document.createElement('div');
  el.id = id;
  Object.assign(el.style, {
    position: 'absolute',
    pointerEvents: 'none',
    boxSizing: 'border-box',
    background: 'transparent',
    borderStyle: 'solid',
    borderColor: color,
    borderTopWidth: '0px',
    borderRightWidth: '0px',
    borderBottomWidth: '0px',
    borderLeftWidth: '0px',
    transition: 'all 80ms ease-out',
    display: 'none',
    zIndex: String(zIndex),
  });
  return el;
}

export function ensureOverlays() {
  if (teardown) return; // panel closed — refuse to re-paint
  if (!hoverOverlay) {
    hoverOverlay = document.createElement('div');
    hoverOverlay.id = 'dm-hover';
    Object.assign(hoverOverlay.style, {
      ...OVERLAY_BASE,
      zIndex: String(Z_INDEX.HOVER_OVERLAY),
      borderStyle: 'solid',
      borderWidth: '2px',
      borderColor: hoverHex,
      backgroundColor: hoverFillCss,
    });
    document.documentElement.appendChild(hoverOverlay);
  }
  if (!hoverMarginBand) {
    hoverMarginBand = makeBand('dm-hover-margin', Z_INDEX.HOVER_BANDS, marginBandCss);
    document.documentElement.appendChild(hoverMarginBand);
  }
  if (!hoverPaddingBand) {
    hoverPaddingBand = makeBand('dm-hover-padding', Z_INDEX.HOVER_BANDS, paddingBandCss);
    document.documentElement.appendChild(hoverPaddingBand);
  }
  if (!selectOverlay) {
    selectOverlay = document.createElement('div');
    selectOverlay.id = 'dm-select';
    Object.assign(selectOverlay.style, {
      ...OVERLAY_BASE,
      zIndex: String(Z_INDEX.SELECT_OVERLAY),
      borderStyle: 'solid',
      borderWidth: '2px',
      borderColor: selectHex,
    });
    document.documentElement.appendChild(selectOverlay);
  }
  if (!selectMarginBand) {
    selectMarginBand = makeBand('dm-select-margin', Z_INDEX.SELECT_BANDS, marginBandCss);
    document.documentElement.appendChild(selectMarginBand);
  }
  if (!selectPaddingBand) {
    selectPaddingBand = makeBand('dm-select-padding', Z_INDEX.SELECT_BANDS, paddingBandCss);
    document.documentElement.appendChild(selectPaddingBand);
  }
  if (!dimensionLabel) {
    dimensionLabel = document.createElement('div');
    dimensionLabel.id = 'dm-dim-label';
    Object.assign(dimensionLabel.style, {
      position: 'absolute', pointerEvents: 'none',
      zIndex: String(Z_INDEX.SELECT_OVERLAY + 1),
      background: selectHex, color: '#fff', fontSize: '10px',
      fontFamily: 'monospace', padding: '2px 6px', borderRadius: '3px',
      display: 'none', whiteSpace: 'nowrap',
    });
    document.documentElement.appendChild(dimensionLabel);
  }
}

function positionOverlayFromRect(overlay: HTMLDivElement, rect: Rect) {
  Object.assign(overlay.style, {
    display: 'block',
    top: rect.top + 'px', left: rect.left + 'px',
    width: rect.width + 'px', height: rect.height + 'px',
  });
}

// Position the margin + padding bands around the inspected element.
// rect = the element's border-box (what getElementRect returns).
// The margin band sits at the margin-outer-box; the padding band sits at
// the padding-box (rect shrunk by border widths). Each band is a single
// div with box-sizing:border-box and four border-{side} widths matching
// the element's spacing on that side — so asymmetric margins / paddings
// render correctly with no extra elements.
function positionBands(el: HTMLElement, rect: Rect, marginBand: HTMLDivElement, paddingBand: HTMLDivElement) {
  const cs = getComputedStyle(el);
  const px = (v: string) => parseFloat(v) || 0;
  const mt = px(cs.marginTop),  mr = px(cs.marginRight),
        mb = px(cs.marginBottom), ml = px(cs.marginLeft);
  const pt = px(cs.paddingTop), pr = px(cs.paddingRight),
        pb = px(cs.paddingBottom), pl = px(cs.paddingLeft);
  const bt = px(cs.borderTopWidth),  br_ = px(cs.borderRightWidth),
        bb = px(cs.borderBottomWidth), bl = px(cs.borderLeftWidth);

  if (mt || mr || mb || ml) {
    Object.assign(marginBand.style, {
      display: 'block',
      top: (rect.top - mt) + 'px',
      left: (rect.left - ml) + 'px',
      width: (rect.width + ml + mr) + 'px',
      height: (rect.height + mt + mb) + 'px',
      borderTopWidth: mt + 'px',
      borderRightWidth: mr + 'px',
      borderBottomWidth: mb + 'px',
      borderLeftWidth: ml + 'px',
    });
  } else {
    marginBand.style.display = 'none';
  }

  if (pt || pr || pb || pl) {
    Object.assign(paddingBand.style, {
      display: 'block',
      top: (rect.top + bt) + 'px',
      left: (rect.left + bl) + 'px',
      width: Math.max(0, rect.width - bl - br_) + 'px',
      height: Math.max(0, rect.height - bt - bb) + 'px',
      borderTopWidth: pt + 'px',
      borderRightWidth: pr + 'px',
      borderBottomWidth: pb + 'px',
      borderLeftWidth: pl + 'px',
    });
  } else {
    paddingBand.style.display = 'none';
  }
}

function hideBands(marginBand: HTMLDivElement | null, paddingBand: HTMLDivElement | null) {
  if (marginBand) marginBand.style.display = 'none';
  if (paddingBand) paddingBand.style.display = 'none';
}

export function showHover(el: HTMLElement) {
  if (teardown) return;
  ensureOverlays();
  if (!hoverOverlay) return;
  const rect = getElementRect(el);
  positionOverlayFromRect(hoverOverlay, rect);
  if (hoverMarginBand && hoverPaddingBand) {
    positionBands(el, rect, hoverMarginBand, hoverPaddingBand);
  }
}

export function hideHover() {
  if (hoverOverlay) hoverOverlay.style.display = 'none';
  hideBands(hoverMarginBand, hoverPaddingBand);
}

export function showSelect(el: HTMLElement) {
  if (teardown) return;
  ensureOverlays();
  if (!selectOverlay || !dimensionLabel) return;
  const rect = getElementRect(el);
  positionOverlayFromRect(selectOverlay, rect);
  if (selectMarginBand && selectPaddingBand) {
    positionBands(el, rect, selectMarginBand, selectPaddingBand);
  }
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  dimensionLabel.textContent = `${w} × ${h}`;
  Object.assign(dimensionLabel.style, {
    display: 'block',
    top: (rect.top + rect.height + 4) + 'px',
    left: rect.left + 'px',
  });
}

export function hideSelect() {
  if (selectOverlay) selectOverlay.style.display = 'none';
  if (dimensionLabel) dimensionLabel.style.display = 'none';
  hideBands(selectMarginBand, selectPaddingBand);
}

// Toggle every hover/select outline, dimension label, and box-model band out
// of the captured frame for a screenshot, then back. `visibility` keeps each
// element's display state intact so the inspector resumes unchanged.
export function setOverlaysHiddenForCapture(hidden: boolean) {
  const v = hidden ? 'hidden' : '';
  for (const el of [hoverOverlay, selectOverlay, dimensionLabel,
    hoverMarginBand, hoverPaddingBand, selectMarginBand, selectPaddingBand]) {
    if (el) el.style.visibility = v;
  }
}

export function updateSelectPosition(el: HTMLElement) {
  if (selectOverlay?.style.display !== 'none') showSelect(el);
}

// During a live drag the 80ms ease lags the box behind the cursor; turn it
// off so the orange outline + dimension label track the element instantly.
export function setOverlayTransitions(enabled: boolean) {
  const t = enabled ? 'all 80ms ease-out' : 'none';
  if (selectOverlay) selectOverlay.style.transition = t;
  if (dimensionLabel) dimensionLabel.style.transition = t;
  if (hoverOverlay) hoverOverlay.style.transition = t;
  if (hoverMarginBand) hoverMarginBand.style.transition = t;
  if (hoverPaddingBand) hoverPaddingBand.style.transition = t;
  if (selectMarginBand) selectMarginBand.style.transition = t;
  if (selectPaddingBand) selectPaddingBand.style.transition = t;
}

export function destroyOverlays() {
  teardown = true;
  [
    hoverOverlay, selectOverlay, dimensionLabel,
    hoverMarginBand, hoverPaddingBand,
    selectMarginBand, selectPaddingBand,
  ].forEach(el => el?.remove());
  hoverOverlay = selectOverlay = dimensionLabel = null;
  hoverMarginBand = hoverPaddingBand = null;
  selectMarginBand = selectPaddingBand = null;
}

// Called from enable() so a re-opened panel can paint overlays again.
export function resetOverlayTeardown() {
  teardown = false;
}

export function isOverlayElement(el: HTMLElement): boolean {
  return (
    el === hoverOverlay ||
    el === selectOverlay ||
    el === dimensionLabel ||
    el === hoverMarginBand ||
    el === hoverPaddingBand ||
    el === selectMarginBand ||
    el === selectPaddingBand
  );
}
