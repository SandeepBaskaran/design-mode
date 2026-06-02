// ============================================================
// Design Mode — Screenshots
// Captures the visible viewport via chrome.tabs.captureVisibleTab and
// crops to the selected element when needed. The previous SVG-foreignObject
// approach was unreliable because it can't paint cross-origin images,
// background-image URLs, or external fonts — most real pages came out blank.
// ============================================================

import { setOverlaysHiddenForCapture } from './overlays';
import { setGuidesHiddenForCapture } from './measure-guides';
import { setPinsHiddenForCapture } from './comments';

export async function captureViewportScreenshot(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'CAPTURE_VIEWPORT' }, (response) => {
        resolve(response?.dataUrl || null);
      });
    } catch {
      resolve(null);
    }
  });
}

// Hide every Design Mode overlay (selection / hover outlines, margin & padding
// bands, axis / distance / resize guides, comment pins) for the duration of a
// capture so the screenshot shows only the page, then restore them. A single
// rAF fires *before* the hidden state composites, so captureVisibleTab would
// still grab the old frame — wait TWO frames so the hidden state is painted.
export async function withDmOverlaysHidden<T>(fn: () => Promise<T>): Promise<T> {
  setOverlaysHiddenForCapture(true);
  setGuidesHiddenForCapture(true);
  setPinsHiddenForCapture(true);
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  try {
    return await fn();
  } finally {
    setOverlaysHiddenForCapture(false);
    setGuidesHiddenForCapture(false);
    setPinsHiddenForCapture(false);
  }
}

export async function captureViewportScreenshotClean(): Promise<string | null> {
  return withDmOverlaysHidden(() => captureViewportScreenshot());
}

export async function captureElementScreenshot(elementId: string): Promise<string | null> {
  const el = document.querySelector(`[data-dm-id="${elementId}"]`) as HTMLElement | null;
  if (!el) return null;

  // Make sure the element is on screen before we capture the viewport.
  // `instant` keeps us synchronous-ish; we still wait a frame for the
  // browser to paint after the scroll.
  el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
  await new Promise<void>((r) => requestAnimationFrame(() => r()));

  // Capture with every Design Mode overlay hidden so the crop shows only the
  // element — no selection outline, margin/padding bands, guides, or pins.
  const viewportDataUrl = await withDmOverlaysHidden(() => captureViewportScreenshot());
  if (!viewportDataUrl) return null;

  // Get the rect after scroll has settled (overlays are visible again here,
  // but they never affect the element's own box).
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  return cropDataUrl(viewportDataUrl, rect);
}

// Capture a region comment's rectangle. `region` is in document coordinates
// (scroll-independent), so translate to viewport space, capture the page with
// all DM overlays hidden, and crop. Returns null if the region isn't on screen.
export async function captureRegionScreenshot(region: { x: number; y: number; w: number; h: number }): Promise<string | null> {
  if (!region || region.w <= 0 || region.h <= 0) return null;
  const viewportDataUrl = await withDmOverlaysHidden(() => captureViewportScreenshot());
  if (!viewportDataUrl) return null;
  const rect = new DOMRect(region.x - window.scrollX, region.y - window.scrollY, region.w, region.h);
  if (rect.left + rect.width <= 0 || rect.top + rect.height <= 0 ||
      rect.left >= window.innerWidth || rect.top >= window.innerHeight) return null;
  return cropDataUrl(viewportDataUrl, rect);
}

// Crop the captured viewport (which is rendered at devicePixelRatio) to the
// element's rect. Anything outside the visible viewport is clamped — taller
// elements just produce the visible portion.
async function cropDataUrl(dataUrl: string, rect: DOMRect): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        // Map page CSS pixels onto the captured image's pixels. Chrome's
        // captureVisibleTab returns the picture at the actual rendered size,
        // so the ratio is image-width / viewport-width.
        const scaleX = img.naturalWidth / window.innerWidth;
        const scaleY = img.naturalHeight / window.innerHeight;

        const sx = Math.max(0, rect.left * scaleX);
        const sy = Math.max(0, rect.top * scaleY);
        const sw = Math.min(img.naturalWidth - sx, rect.width * scaleX);
        const sh = Math.min(img.naturalHeight - sy, rect.height * scaleY);
        if (sw <= 0 || sh <= 0) { resolve(null); return; }

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(sw);
        canvas.height = Math.round(sh);
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }

        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
