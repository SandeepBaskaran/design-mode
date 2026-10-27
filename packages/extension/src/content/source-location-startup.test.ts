import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SourceLocation } from '@shared/types';

// End-to-end through resolveSourceLocation: React's MAIN-world _debugSource
// reports the bundler-intermediate position (generated line 27, column 7);
// the served module's inline source map must refine it to the authored
// Card.jsx line 8, column 7. The fetch gate has to open from the startup
// storage read even when the first edit lands before that read resolves —
// the C.2 regression (StorageArea.get called unbound threw "Illegal
// invocation" and fail-closed every tab) recorded the raw :27 for the rest
// of the tab's life. Runs in its own process: the gate's initial read is
// one-shot module state.

const CARD_FILE = '/proj/src/Card.jsx';
const MOD_URL = 'https://app.test/src/Card.jsx';
const FIBER_REPORT = { file: CARD_FILE, line: 27, column: 7, component: 'Card' };

// Mirrors sourcemap-resolver.test.ts's servedCardModule: the button's jsxDEV
// literal sits at generated line 27 (1-based) and the inline map carries
// generated lines 25–29 back to authored (8,7) 1-based.
function servedCardModule(): string {
  const body = [
    'import { jsxDEV } from "react/jsx-dev-runtime";',
    ...Array.from({ length: 18 }, () => '// filler'),
    '    /* @__PURE__ */ jsxDEV("h1", { id: "card-title", children: "Card" }, void 0, false, {',
    `      fileName: "${CARD_FILE}",`,
    '      lineNumber: 26,',
    '      columnNumber: 7',
    '    }, this),',
    '    /* @__PURE__ */ jsxDEV("button", { id: "target-btn" }, void 0, false, {',
    `      fileName: "${CARD_FILE}",`,
    '      lineNumber: 27,',
    '      columnNumber: 7',
    '    }, this);',
    '//# sourceMappingURL=' + inlineMapURI([
      [19, 0, 0, 6, 6],
      [20, 0, 0, 6, 6],
      [21, 0, 0, 6, 6],
      [22, 0, 0, 6, 6],
      [23, 0, 0, 6, 6],
      [24, 4, 0, 7, 6],
      [25, 0, 0, 7, 6],
      [26, 0, 0, 7, 6],
      [27, 0, 0, 7, 6],
      [28, 0, 0, 7, 6],
    ]),
  ];
  return body.join('\n') + '\n';
}

function inlineMapURI(entries: number[][]): string {
  const map = { version: 3, sources: ['Card.jsx'], names: [] as string[], mappings: buildMappings(entries) };
  return 'data:application/json;base64,' + Buffer.from(JSON.stringify(map)).toString('base64');
}

// Same VLQ encoding as the resolver's own fixtures: relative deltas.
function buildMappings(entries: number[][]): string {
  let prevSrc = 0, prevLine = 0, prevCol = 0;
  const lines: string[] = [];
  let lastGenLine = -1;
  for (const [genLine, genCol, srcIdx, srcLine, srcCol] of entries) {
    while (lines.length < genLine) lines.push('');
    if (lines.length > genLine + 1) throw new Error('entries must be per-line ordered');
    const parts = [vlq(genCol), vlq(srcIdx - (genLine === lastGenLine ? prevSrc : 0)), vlq(srcLine - prevLine), vlq(srcCol - prevCol)];
    prevSrc = srcIdx; prevLine = srcLine; prevCol = srcCol;
    lastGenLine = genLine;
    lines[genLine] = (lines[genLine] ? lines[genLine] + ',' : '') + parts.join('');
  }
  return lines.join(';');
}

function vlq(n: number): string {
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let v = n < 0 ? ((-n) << 1) | 1 : n << 1;
  let out = '';
  do {
    let digit = v & 31;
    v >>>= 5;
    if (v > 0) digit |= 32;
    out += B64[digit];
  } while (v > 0);
  return out;
}

interface Harness {
  resolveSourceLocation(el: HTMLElement): Promise<SourceLocation | null>;
  releaseRead(value: Record<string, unknown>): void;
}

async function harness(opts: { deferredRead: boolean }): Promise<Harness> {
  let release!: (v: Record<string, unknown>) => void;
  const readPromise = opts.deferredRead
    ? new Promise<Record<string, unknown>>(resolve => { release = resolve; })
    : Promise.resolve({});
  const area = {
    get: function (this: unknown, keys: string[]) {
      if (this !== area) {
        throw new TypeError('Illegal invocation: Function must be called on an object of type StorageArea');
      }
      assert.deepEqual(keys, ['dm-sourcemap-fetch']);
      return readPromise;
    },
    onChanged: { addListener: () => {} },
  };
  const saved = {
    browser: (globalThis as any).browser,
    location: (globalThis as any).location,
    performance: (globalThis as any).performance,
    document: (globalThis as any).document,
    fetch: (globalThis as any).fetch,
  };
  (globalThis as any).browser = {
    runtime: { sendMessage: async () => FIBER_REPORT },
    storage: { local: area },
  };
  (globalThis as any).location = { origin: 'https://app.test' };
  (globalThis as any).performance = { getEntriesByType: () => [{ name: MOD_URL }] };
  (globalThis as any).document = { querySelectorAll: () => [] };
  (globalThis as any).fetch = (url: string) => {
    assert.equal(url, MOD_URL, 'the refinement fetches the served module itself');
    return Promise.resolve({
      ok: true,
      headers: { get: () => null },
      text: () => Promise.resolve(servedCardModule()),
    });
  };
  const mod = await import('./source-detection.ts');
  return {
    resolveSourceLocation: mod.resolveSourceLocation,
    releaseRead: (value) => release(value),
  };
}

const el = { getAttribute: (n: string) => (n === 'data-dm-id' ? 'dm-1' : null) } as unknown as HTMLElement;

describe('source location startup refinement (C.2 regression — exact authored position)', () => {
  it('edit before the startup storage read resolves: gate opens late, refinement still lands on Card.jsx:8:7', async () => {
    const h = await harness({ deferredRead: true });
    const pending = h.resolveSourceLocation(el); // the "edit immediately after load" moment
    await new Promise(r => setTimeout(r, 0));
    h.releaseRead({}); // dm-sourcemap-fetch absent → documented on default
    const loc = await pending;
    assert.equal(loc?.file, CARD_FILE);
    assert.equal(loc?.line, 8, 'authored line, not the bundler-intermediate 27');
    assert.equal(loc?.column, 7);
    assert.equal(loc?.component, 'Card');
    assert.equal(loc?.framework, 'react');
  });

  it('edit after the gate is known: refinement still lands on Card.jsx:8:7', async () => {
    const h = await harness({ deferredRead: false });
    const loc = await h.resolveSourceLocation(el);
    assert.equal(loc?.file, CARD_FILE);
    assert.equal(loc?.line, 8);
    assert.equal(loc?.column, 7);
  });
});
