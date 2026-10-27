// ============================================================
// User gate for the source-map resolution fetches
// (chrome.storage.local key `dm-sourcemap-fetch`). The fetches are
// same-origin reads of resources the page already loaded, so the
// documented default is on, but they remain outbound calls the user
// can switch off. Fail closed: until the saved value is known —
// including when storage is unavailable or the read fails — no fetch
// starts, so a fetch can never run on the load-time guess that the
// setting is on. onChanged keeps live changes applying after that.
// ============================================================

const STORAGE_KEY = 'dm-sourcemap-fetch';

let known = false;
let enabled = false;

export function sourcemapFetchEnabled(): boolean {
  return known && enabled;
}

// Anything but an explicit stored false is the documented default; shared
// by the storage listeners and the tests. Marks the gate known.
export function applySourcemapFetchValue(value: unknown): void {
  known = true;
  enabled = value !== false;
}

// Fail closed when the saved value can't be established.
function failClosed(): void {
  known = true;
  enabled = false;
}

let readiness: Promise<void> | null = null;

// Awaited by every fetch path before it runs. The initial storage read is
// one-shot, but the resolved value is read live at each await so a value
// that landed via onChanged after the read is honoured.
export function whenSourcemapFetchSettingKnown(): Promise<boolean> {
  if (!readiness) readiness = readStored();
  return readiness.then(() => sourcemapFetchEnabled());
}

async function readStored(): Promise<void> {
  if (known) return;
  try {
    const area = browser.storage?.local;
    // StorageArea methods are native functions that throw "Illegal
    // invocation" when called without the area as their receiver — which
    // the catch below would read as "no storage here" and fail-close the
    // gate for the tab's lifetime. Invoke as a method on the area so the
    // receiver binds; never pull `get` off the area and call it unbound.
    if (!area || typeof area.get !== 'function') {
      failClosed();
      return;
    }
    const r = await area.get([STORAGE_KEY]);
    // A change that landed via onChanged while the read was in flight is
    // at least as fresh as the read's snapshot — keep it.
    if (!known) applySourcemapFetchValue(r?.[STORAGE_KEY]);
  } catch {
    // No storage in this context (tests, SSR) or the read failed: no fetch.
    if (!known) failClosed();
  }
}

try {
  browser.storage?.onChanged?.addListener?.((changes, area) => {
    if (area !== 'local') return;
    if (changes[STORAGE_KEY]) applySourcemapFetchValue(changes[STORAGE_KEY].newValue);
  });
} catch {
  // No extension storage in this context (tests, SSR) — the gate stays
  // closed until a read or an onChanged event says otherwise.
}
