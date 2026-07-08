// ============================================================
// Design Mode — Custom cursor (app icon while the panel is open)
// ============================================================

const SETTING_KEY = 'dm-custom-cursor';

let enabled = true;
let active = false;
let inspectProbe: () => boolean = () => false;

// -webkit-image-set at 2x renders the 48px icon at ~24px on every display
// density; the keyword fallback keeps the cursor usable if the image
// fails to load. The icon must stay listed in web_accessible_resources.
function iconCursor(fallback: string): string {
  const url = chrome.runtime.getURL('icons/icon48.png');
  return `-webkit-image-set(url("${url}") 2x) 4 4, ${fallback}`;
}

export function baseCursor(): string {
  return enabled ? iconCursor('crosshair') : 'crosshair';
}

function repaint() {
  document.documentElement.style.cursor = inspectProbe()
    ? baseCursor()
    : (enabled ? iconCursor('default') : '');
}

export function initCustomCursor(isInspectActive: () => boolean) {
  inspectProbe = isInspectActive;
}

export function applyBaseCursor() {
  active = true;
  repaint();
}

export function restoreBaseCursor() {
  if (active) repaint();
  else document.documentElement.style.cursor = '';
}

export function clearBaseCursor() {
  active = false;
  const cur = document.documentElement.style.cursor;
  if (cur === 'crosshair' || cur === 'move' || cur.includes('image-set(')) {
    document.documentElement.style.cursor = '';
  }
}

try {
  chrome.storage?.local?.get?.([SETTING_KEY], (r: any) => {
    if (typeof r?.[SETTING_KEY] === 'boolean') enabled = r[SETTING_KEY];
    if (active) repaint();
  });
  chrome.storage?.onChanged?.addListener?.((changes, area) => {
    if (area !== 'local' || !changes[SETTING_KEY]) return;
    enabled = changes[SETTING_KEY].newValue !== false;
    if (active) repaint();
  });
} catch {}
