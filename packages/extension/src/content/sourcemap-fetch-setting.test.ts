import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  sourcemapFetchEnabled,
  applySourcemapFetchValue,
} from './sourcemap-fetch-setting.ts';
import { resolveSourceLocation } from './source-detection.ts';

// The gate is shared mutable state and its initial storage read is consumed
// once per process: the deferred-read regression test runs first so the
// still-unknown gate governs it, and every later test pins the post-read
// state via applySourcemapFetchValue.
describe('sourcemap fetch gate', () => {
  it('delays fetch-based resolution until the stored value is known, then honours it', async () => {
    const previousBrowser = (globalThis as any).browser;
    let release!: (v: Error) => void;
    const deferredGet = new Promise<Record<string, unknown>>((_resolve, reject) => { release = reject; });
    (globalThis as any).browser = {
      runtime: {
        sendMessage: async () => ({ file: '/proj/src/Card.jsx', line: 27, column: 7, component: 'Card' }),
      },
      storage: {
        local: { get: () => deferredGet },
        onChanged: { addListener: () => {} },
      },
    };
    const saved = {
      location: (globalThis as any).location,
      performance: (globalThis as any).performance,
      document: (globalThis as any).document,
      fetch: (globalThis as any).fetch,
    };
    const fetchCalls: string[] = [];
    (globalThis as any).location = { origin: 'https://defer.test' };
    (globalThis as any).performance = { getEntriesByType: () => [{ name: 'https://defer.test/src/Card.jsx' }] };
    (globalThis as any).document = { querySelectorAll: () => [] };
    (globalThis as any).fetch = (url: string) => {
      fetchCalls.push(url);
      return Promise.reject(new Error('fetch blocked while gate unknown'));
    };
    const el = { getAttribute: (n: string) => (n === 'data-dm-id' ? 'dm-1' : null) } as unknown as HTMLElement;
    try {
      const resolution = resolveSourceLocation(el);
      await new Promise(r => setTimeout(r, 0));
      assert.deepEqual(fetchCalls, []);

      release(new Error('storage read failed'));
      const loc = await resolution;
      assert.equal(loc?.line, 27, 'raw React report kept when fetches are blocked');
      assert.deepEqual(fetchCalls, []);
    } finally {
      applySourcemapFetchValue(true);
      (globalThis as any).location = saved.location;
      (globalThis as any).performance = saved.performance;
      (globalThis as any).document = saved.document;
      (globalThis as any).fetch = saved.fetch;
      (globalThis as any).browser = previousBrowser;
    }
  });

  it('treats only an explicit false as off; anything else is the on default', () => {
    try {
      applySourcemapFetchValue(undefined);
      assert.equal(sourcemapFetchEnabled(), true);
      applySourcemapFetchValue(false);
      assert.equal(sourcemapFetchEnabled(), false);
      applySourcemapFetchValue(true);
      assert.equal(sourcemapFetchEnabled(), true);
    } finally {
      applySourcemapFetchValue(true);
    }
  });

  it('a stored false still blocks the sync gate once known', () => {
    applySourcemapFetchValue(false);
    try {
      assert.equal(sourcemapFetchEnabled(), false);
    } finally {
      applySourcemapFetchValue(true);
    }
  });
});

// The initial storage read must call StorageArea.get with the area as its
// receiver — see sourcemap-fetch-setting.receiver.test.ts, which runs in its
// own process so the one-shot module state is still unknown.
