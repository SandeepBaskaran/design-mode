import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Native StorageArea methods throw "Illegal invocation" when invoked without
// the area as receiver. The initial read once destructured `get` and called
// it unbound, so the real browser fail-closed the gate on every tab — while
// closure-based stubs (no receiver check) kept the tests green. This file
// runs in its own test process so the gate's one-shot module state is still
// unknown and the initial read is exercised for real; later value flips go
// through onChanged, matching the runtime shape (one read per tab, live
// changes after it).

function nativeStorageArea(stored: Record<string, unknown>) {
  const listeners: Array<(changes: Record<string, unknown>, area: string) => void> = [];
  const area = {
    get: function (this: unknown, keys: string[]) {
      if (this !== area) {
        throw new TypeError('Illegal invocation: Function must be called on an object of type StorageArea');
      }
      const out: Record<string, unknown> = {};
      for (const k of keys) if (k in stored) out[k] = stored[k];
      return Promise.resolve(out);
    },
    onChanged: {
      addListener: (fn: (changes: Record<string, unknown>, area: string) => void) => listeners.push(fn),
    },
  };
  return { area, listeners };
}

describe('sourcemap fetch gate — StorageArea receiver (C.2 regression)', () => {
  it('the initial read is bound (absent key = on default) and onChanged flips honour explicit false', async () => {
    const { area, listeners } = nativeStorageArea({}); // dm-sourcemap-fetch absent
    (globalThis as any).browser = { storage: { local: area, onChanged: area.onChanged } };
    try {
      const gate = await import('./sourcemap-fetch-setting.ts');
      assert.equal(await gate.whenSourcemapFetchSettingKnown(), true, 'absent key must open the gate, not fail closed');

      // Live change after the read: the documented off value closes it.
      assert.equal(listeners.length, 1, 'onChanged listener registered at load');
      listeners[0]({ 'dm-sourcemap-fetch': { newValue: false } }, 'local');
      assert.equal(await gate.whenSourcemapFetchSettingKnown(), false, 'stored false must stay off');

      listeners[0]({ 'dm-sourcemap-fetch': { newValue: undefined } }, 'local');
      assert.equal(await gate.whenSourcemapFetchSettingKnown(), true, 'removal returns to the on default');
    } finally {
      delete (globalThis as any).browser;
    }
  });
});
