import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeVLQ,
  decodeMappings,
  decodeSourceMap,
  originalPositionFor,
  parseSourceMappingURL,
  resolveMapURL,
  joinSourceRoot,
  loadSourceMap,
  fetchResourceText,
  isManagedSheet,
  pickSourceRule,
  resolveViaSourceMaps,
  findSourceObjectOffset,
  refineReactSourcePosition,
  type DecodedSourceMap,
} from './sourcemap-resolver.ts';
import { resolveSourceLocation, toSourceLocation } from './source-detection.ts';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function encodeVLQ(value: number): string {
  let vlq = value < 0 ? ((-value) << 1) + 1 : value << 1;
  let out = '';
  do {
    let digit = vlq & 31;
    vlq >>>= 5;
    if (vlq > 0) digit |= 32;
    out += B64[digit];
  } while (vlq > 0);
  return out;
}

function buildMappings(entries: number[][]): string {
  const lines: string[][] = [];
  let pSrc = 0, pLine = 0, pCol = 0, pName = 0;
  let curLine = -1, prevCol = 0;
  for (const e of entries) {
    while (curLine < e[0]) { lines.push([]); curLine++; prevCol = 0; }
    const parts = [encodeVLQ(e[1] - prevCol)];
    prevCol = e[1];
    if (e.length >= 5) {
      parts.push(encodeVLQ(e[2] - pSrc), encodeVLQ(e[3] - pLine), encodeVLQ(e[4] - pCol));
      pSrc = e[2]; pLine = e[3]; pCol = e[4];
      if (e.length >= 6) { parts.push(encodeVLQ(e[5] - pName)); pName = e[5]; }
    }
    lines[e[0]].push(parts.join(''));
  }
  return lines.map(l => l.join(',')).join(';');
}

function fetchStub(body: string | null, opts: { status?: number; contentLength?: string | null } = {}) {
  let calls = 0;
  const impl = (_url: string, _init?: { signal?: AbortSignal }) => {
    calls++;
    return Promise.resolve({
      ok: (opts.status ?? 200) >= 200 && (opts.status ?? 200) < 300,
      status: opts.status ?? 200,
      headers: { get: (name: string) => (name.toLowerCase() === 'content-length' ? (opts.contentLength ?? null) : null) },
      text: () => Promise.resolve(body ?? ''),
    });
  };
  return { impl: impl as unknown as typeof fetch, calls: () => calls };
}

function mapFixture(): DecodedSourceMap {
  const map = decodeSourceMap(JSON.stringify({
    version: 3,
    sourceRoot: 'src/',
    sources: ['views/App.tsx', 'styles/card.css'],
    names: ['App'],
    mappings: buildMappings([
      [0, 0, 0, 0, 0, 0],
      [0, 40, 0, 2, 0, 0],
      [1, 0, 1, 0, 0],
    ]),
  }));
  assert.ok(map);
  return map;
}

describe('decodeVLQ', () => {
  it('decodes single and multi-digit values', () => {
    assert.deepEqual(decodeVLQ('A'), [0]);
    assert.deepEqual(decodeVLQ('C'), [1]);
    assert.deepEqual(decodeVLQ('D'), [-1]);
    assert.deepEqual(decodeVLQ('e'), [15]);
    assert.deepEqual(decodeVLQ('gB'), [16]);
    assert.deepEqual(decodeVLQ('+B'), [31]);
    assert.deepEqual(decodeVLQ('gC'), [32]);
    assert.deepEqual(decodeVLQ('hB'), [-16]);
    assert.deepEqual(decodeVLQ('AAAA'), [0, 0, 0, 0]);
  });

  it('round-trips against an independent encoder', () => {
    for (const v of [0, 1, -1, 15, 16, 31, 32, -16, 1000, -1000, 1 << 20, -(1 << 20)]) {
      assert.deepEqual(decodeVLQ(encodeVLQ(v)), [v]);
    }
  });

  it('rejects invalid digits and dangling continuations', () => {
    assert.throws(() => decodeVLQ('A*A'));
    assert.throws(() => decodeVLQ('g'));
  });
});

describe('decodeMappings', () => {
  it('decodes generated line/col plus source deltas', () => {
    const segments = decodeMappings(buildMappings([
      [0, 0, 0, 0, 0],
      [0, 40, 0, 2, 0],
      [1, 0, 1, 0, 0],
    ]));
    assert.deepEqual(segments, [
      { genLine: 0, genCol: 0, srcIdx: 0, srcLine: 0, srcCol: 0 },
      { genLine: 0, genCol: 40, srcIdx: 0, srcLine: 2, srcCol: 0 },
      { genLine: 1, genCol: 0, srcIdx: 1, srcLine: 0, srcCol: 0 },
    ]);
  });

  it('carries name indices when the segment has a fifth field', () => {
    const segments = decodeMappings(buildMappings([[0, 0, 0, 0, 0, 3]]));
    assert.deepEqual(segments, [
      { genLine: 0, genCol: 0, srcIdx: 0, srcLine: 0, srcCol: 0, nameIdx: 3 },
    ]);
  });

  it('keeps 1-field segments as unmapped region markers', () => {
    const segments = decodeMappings(buildMappings([[0, 0], [0, 10, 0, 0, 0], [0, 20]]));
    assert.deepEqual(segments, [
      { genLine: 0, genCol: 0 },
      { genLine: 0, genCol: 10, srcIdx: 0, srcLine: 0, srcCol: 0 },
      { genLine: 0, genCol: 20 },
    ]);
  });

  it('advances generated lines across empty mappings entries', () => {
    const segments = decodeMappings(buildMappings([[0, 0, 0, 0, 0], [2, 4, 0, 0, 0]]));
    assert.equal(segments.length, 2);
    assert.deepEqual(segments[1], { genLine: 2, genCol: 4, srcIdx: 0, srcLine: 0, srcCol: 0 });
  });
});

describe('decodeSourceMap', () => {
  it('parses a valid v3 map', () => {
    const map = decodeSourceMap(JSON.stringify({
      version: 3, file: 'app.js', sourceRoot: 'src/',
      sources: ['a.tsx', null], names: ['x'],
      mappings: buildMappings([[0, 0, 0, 0, 0]]),
    }));
    assert.ok(map);
    assert.equal(map.version, 3);
    assert.equal(map.sourceRoot, 'src/');
    assert.deepEqual(map.sources, ['a.tsx', null]);
    assert.equal(map.segments.length, 1);
  });

  it('returns null for malformed payloads', () => {
    assert.equal(decodeSourceMap('not json'), null);
    assert.equal(decodeSourceMap('{"version":2,"sources":[],"mappings":""}'), null);
    assert.equal(decodeSourceMap('{"version":3,"sources":"x","mappings":"AAAA"}'), null);
    assert.equal(decodeSourceMap('{"version":3,"sources":["a"],"mappings":"A*A"}'), null);
    assert.equal(decodeSourceMap('{"version":3,"sources":["a"],"names":[],"mappings":"g"}'), null);
  });
});

describe('originalPositionFor', () => {
  it('finds the greatest-lower-bound mapping on the same line', () => {
    const map = mapFixture();
    assert.deepEqual(originalPositionFor(map, 0, 50), { file: 'src/views/App.tsx', line: 2, column: 0, component: 'App' });
    assert.deepEqual(originalPositionFor(map, 0, 0), { file: 'src/views/App.tsx', line: 0, column: 0, component: 'App' });
    assert.deepEqual(originalPositionFor(map, 0, 39), { file: 'src/views/App.tsx', line: 0, column: 0, component: 'App' });
    assert.deepEqual(originalPositionFor(map, 1, 0), { file: 'src/styles/card.css', line: 0, column: 0 });
  });

  it('joins sourceRoot without double slashes', () => {
    const map = mapFixture();
    const hit = originalPositionFor(map, 1, 0);
    assert.equal(hit?.file, 'src/styles/card.css');
  });

  it('returns null off-line, in unmapped regions, and out of range', () => {
    const map = mapFixture();
    assert.equal(originalPositionFor(map, 3, 0), null);
    assert.deepEqual(originalPositionFor(map, 0, 100000), { file: 'src/views/App.tsx', line: 2, column: 0, component: 'App' });
    assert.equal(originalPositionFor(map, -1, 0), null);
    const withGap = decodeSourceMap(JSON.stringify({
      version: 3, sources: ['a.tsx'], names: [],
      mappings: buildMappings([[0, 0], [0, 10, 0, 1, 0], [0, 20]]),
    }));
    assert.ok(withGap);
    assert.equal(originalPositionFor(withGap, 0, 5), null);
    assert.deepEqual(originalPositionFor(withGap, 0, 12), { file: 'a.tsx', line: 1, column: 0 });
  });
});

describe('joinSourceRoot', () => {
  it('handles missing, slash-less, and absolute sources', () => {
    assert.equal(joinSourceRoot(undefined, 'a.ts'), 'a.ts');
    assert.equal(joinSourceRoot('src', 'a.ts'), 'src/a.ts');
    assert.equal(joinSourceRoot('src/', 'a.ts'), 'src/a.ts');
    assert.equal(joinSourceRoot('src/', '/abs/a.ts'), 'src//abs/a.ts');
  });
});

describe('parseSourceMappingURL', () => {
  it('reads JS and CSS comment forms', () => {
    assert.equal(parseSourceMappingURL('code();\n//# sourceMappingURL=app.js.map'), 'app.js.map');
    assert.equal(parseSourceMappingURL('.x{}\n/*@ sourceMappingURL=app.css.map */'), 'app.css.map');
    assert.equal(parseSourceMappingURL('.x{}\n/*# sourceMappingURL=app.css.map */'), 'app.css.map');
    assert.equal(parseSourceMappingURL('//# sourceMappingURL=a.map\n//# sourceMappingURL=b.map'), 'b.map');
    assert.equal(parseSourceMappingURL('no comment here'), null);
  });
});

describe('resolveMapURL', () => {
  it('passes data URIs through and resolves relatives', () => {
    const data = 'data:application/json;base64,e30=';
    assert.equal(resolveMapURL(data, 'https://app.test/x.js'), data);
    assert.equal(resolveMapURL('app.js.map', 'https://app.test/assets/x.js'), 'https://app.test/assets/app.js.map');
    assert.equal(resolveMapURL('/maps/x.map', 'https://app.test/assets/x.js'), 'https://app.test/maps/x.map');
    assert.equal(resolveMapURL('x.map', null), null);
  });
});

describe('loadSourceMap', () => {
  it('decodes base64 data URIs without fetching', async () => {
    const json = JSON.stringify({ version: 3, sources: ['a.tsx'], names: [], mappings: buildMappings([[0, 0, 0, 0, 0]]) });
    const uri = 'data:application/json;base64,' + Buffer.from(json).toString('base64');
    const { impl, calls } = fetchStub('');
    const map = await loadSourceMap(uri, { pageOrigin: 'https://app.test', fetchImpl: impl });
    assert.ok(map);
    assert.deepEqual(originalPositionFor(map, 0, 0), { file: 'a.tsx', line: 0, column: 0 });
    assert.equal(calls(), 0);
  });

  it('decodes percent-encoded data URIs', async () => {
    const json = JSON.stringify({ version: 3, sources: ['b.tsx'], names: [], mappings: buildMappings([[0, 0, 0, 0, 0]]) });
    const uri = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
    const map = await loadSourceMap(uri, { pageOrigin: 'https://app.test' });
    assert.ok(map);
    assert.equal(map.sources[0], 'b.tsx');
  });

  it('rejects cross-origin maps before fetching', async () => {
    const { impl, calls } = fetchStub('{}');
    const map = await loadSourceMap('https://evil.test/x.map', { pageOrigin: 'https://app.test', fetchImpl: impl });
    assert.equal(map, null);
    assert.equal(calls(), 0);
  });

  it('rejects non-http schemes', async () => {
    const map = await loadSourceMap('file:///etc/x.map', { pageOrigin: 'file://' });
    assert.equal(map, null);
  });

  it('honours the size cap via content-length', async () => {
    const { impl, calls } = fetchStub('{}', { contentLength: String(6 * 1024 * 1024) });
    const map = await loadSourceMap('https://app.test/cap.map', { pageOrigin: 'https://app.test', fetchImpl: impl });
    assert.equal(map, null);
    assert.equal(calls(), 1);
  });

  it('honours the size cap on the body itself', async () => {
    const big = 'x'.repeat(5 * 1024 * 1024 + 1);
    const { impl } = fetchStub(big);
    const map = await loadSourceMap('https://app.test/big.map', { pageOrigin: 'https://app.test', fetchImpl: impl });
    assert.equal(map, null);
  });

  it('caches per URL, including misses', async () => {
    const json = JSON.stringify({ version: 3, sources: ['a.tsx'], names: [], mappings: buildMappings([[0, 0, 0, 0, 0]]) });
    const good = fetchStub(json);
    const goodOpts = { pageOrigin: 'https://app.test', fetchImpl: good.impl };
    const first = await loadSourceMap('https://app.test/good.map', goodOpts);
    const again = await loadSourceMap('https://app.test/good.map', goodOpts);
    assert.ok(first && again);
    assert.equal(good.calls(), 1);
    const bad = fetchStub('not json');
    const badOpts = { pageOrigin: 'https://app.test', fetchImpl: bad.impl };
    const miss = await loadSourceMap('https://app.test/bad.map', badOpts);
    const missAgain = await loadSourceMap('https://app.test/bad.map', badOpts);
    assert.equal(miss, null);
    assert.equal(missAgain, null);
    assert.equal(bad.calls(), 1);
  });

  it('returns null for malformed map payloads fetched same-origin', async () => {
    const { impl } = fetchStub('{"version":2}');
    const map = await loadSourceMap('https://app.test/broken.map', { pageOrigin: 'https://app.test', fetchImpl: impl });
    assert.equal(map, null);
  });

  it('returns null when fetch fails', async () => {
    const failing = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    const map = await loadSourceMap('https://app.test/offline.map', { pageOrigin: 'https://app.test', fetchImpl: failing });
    assert.equal(map, null);
  });
});

describe('toSourceLocation', () => {
  it('converts 0-based map positions to 1-based SourceLocation', () => {
    const loc = toSourceLocation({ file: 'src/views/App.tsx', line: 3, column: 9, component: 'App' });
    assert.equal(loc.file, 'src/views/App.tsx');
    assert.equal(loc.line, 4);
    assert.equal(loc.column, 10);
    assert.equal(loc.component, 'App');
    assert.equal(loc.framework, 'unknown');
    assert.equal(loc.cleanPath, 'src/views/App.tsx');
  });
});

describe('resolveSourceLocation', () => {
  it('returns null for hint-less elements outside a browser', async () => {
    const el = {} as HTMLElement;
    assert.equal(await resolveSourceLocation(el), null);
  });
});

describe('managed-sheet skip', () => {
  const fetchStub = (routes: Record<string, string>) => {
    let mapFetches = 0;
    const impl = (url: string) => {
      const body = routes[url];
      if (body === undefined) return Promise.reject(new Error(`unexpected fetch ${url}`));
      if (url.endsWith('.map')) mapFetches++;
      return Promise.resolve({
        ok: true,
        headers: { get: () => null },
        text: () => Promise.resolve(body),
      });
    };
    return { impl: impl as unknown as typeof fetch, mapFetches: () => mapFetches };
  };

  function authoredSheetFixture() {
    return {
      href: 'https://app.test/card.css',
      ownerNode: { hasAttribute: () => false },
      cssRules: [{
        selectorText: '.card-hero',
        style: { getPropertyValue: (name: string) => (name === 'color' ? 'seagreen' : '') },
      }],
    };
  }

  function managedSheetFixture() {
    return {
      href: null,
      ownerNode: { hasAttribute: (name: string) => name === 'data-dm-managed-sheet', textContent: '/* DIVE override rules */' },
      cssRules: [{
        selectorText: '[data-dm-id="dm-9"]',
        style: { getPropertyValue: (name: string) => (name === 'color' ? 'seagreen' : '') },
      },
      {
        selectorText: '[data-dm-id="dm-9"]',
        style: { getPropertyValue: () => '' },
      }],
    };
  }

  it('pickSourceRule skips managed sheets so the authored declaring rule wins', () => {
    const el = { matches: (sel: string) => sel === '.card-hero' || sel.startsWith('[data-dm-id') };
    const hit = pickSourceRule([authoredSheetFixture(), managedSheetFixture()], el, 'color');
    assert.ok(hit);
    assert.equal(hit.rule.selectorText, '.card-hero');
    assert.equal(hit.sheet.href, 'https://app.test/card.css');
  });

  it('resolves the authored rule end-to-end even when the managed sheet is last', async () => {
    const { impl, mapFetches } = fetchStub({
      'https://app.test/card.css': '.card-hero { color: seagreen; }\n/*# sourceMappingURL=card.css.map */',
      'https://app.test/card.css.map': JSON.stringify({
        version: 3,
        sources: ['card.src.css'],
        names: ['CardHero'],
        mappings: buildMappings([[0, 0, 0, 4, 0, 0]]),
      }),
    });
    const el = { matches: (sel: string) => sel === '.card-hero' || sel.startsWith('[data-dm-id') };
    const oldDocument = globalThis.document;
    try {
      globalThis.document = { styleSheets: [authoredSheetFixture(), managedSheetFixture()] } as unknown as Document;
      const hit = await resolveViaSourceMaps(el, { pageOrigin: 'https://app.test', fetchImpl: impl });
      assert.deepEqual(hit, { file: 'card.src.css', line: 4, column: 0, component: 'CardHero' });
      assert.ok(mapFetches() >= 1, 'the authored .map must actually be fetched');
    } finally {
      globalThis.document = oldDocument;
    }
  });

  it('isManagedSheet reads the owner-node marker, not selector text', () => {
    assert.equal(isManagedSheet({ ownerNode: { hasAttribute: (n: string) => n === 'data-dm-managed-sheet' } }), true);
    assert.equal(isManagedSheet({ ownerNode: { hasAttribute: () => false } }), false);
    assert.equal(isManagedSheet({ ownerNode: null }), false);
    assert.equal(isManagedSheet({}), false);
  });
});

// ── React dev source refinement ──
//
// Vite + @vitejs/plugin-react bakes each JSX element's position in the
// refresh-wrapped intermediate module into a { fileName, lineNumber,
// columnNumber } literal, and React's _debugSource reports that intermediate
// position verbatim. This fixture mirrors the served shape: the button's
// literal sits at generated line 27 (1-based) while the authored button is at
// Card.jsx line 8, and the inline map carries generated lines 25–29 back to
// authored (8,7), generated lines 20–24 back to authored (7,7).
const CARD_FILE = '/proj/src/Card.jsx';

function inlineMapURI(entries: number[][], sources: string[] = ['Card.jsx']): string {
  const map = { version: 3, sources, names: [] as string[], mappings: buildMappings(entries) };
  return 'data:application/json;base64,' + Buffer.from(JSON.stringify(map)).toString('base64');
}

function servedCardModule(opts: { withMap: boolean }): string {
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
  ];
  if (opts.withMap) {
    body.push('//# sourceMappingURL=' + inlineMapURI([
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
    ]));
  }
  return body.join('\n') + '\n';
}

function routeFetch(routes: Record<string, string>) {
  return (url: string) => {
    const body = routes[url];
    if (body === undefined) return Promise.reject(new Error(`unexpected fetch ${url}`));
    return Promise.resolve({
      ok: true,
      headers: { get: () => null },
      text: () => Promise.resolve(body),
    });
  };
}

describe('findSourceObjectOffset', () => {
  const text = servedCardModule({ withMap: false });

  it('finds the literal whose fileName, line, and column all match', () => {
    const expected = text.indexOf('lineNumber: 27');
    assert.ok(expected > 0);
    assert.equal(findSourceObjectOffset(text, CARD_FILE, 27, 7), expected);
  });

  it('matches the compact no-space form emitted by some transforms', () => {
    const compact = '{ fileName: "a.jsx", lineNumber:12, columnNumber: 3 }';
    assert.equal(findSourceObjectOffset(compact, 'a.jsx', 12, 3), compact.indexOf('lineNumber:12'));
  });

  it('rejects prefix hits (27 inside 271) and keeps scanning', () => {
    const withPrefix = [
      `{ fileName: "${CARD_FILE}", lineNumber: 271, columnNumber: 7 },`,
      `{ fileName: "${CARD_FILE}", lineNumber: 27, columnNumber: 7 },`,
    ].join('\n');
    assert.equal(findSourceObjectOffset(withPrefix, CARD_FILE, 27, 7), withPrefix.lastIndexOf('lineNumber: 27'));
  });

  it('returns -1 when the file, column, or literal is absent', () => {
    assert.equal(findSourceObjectOffset(text, '/proj/src/Other.jsx', 27, 7), -1);
    assert.equal(findSourceObjectOffset(text, CARD_FILE, 27, 9), -1);
    assert.equal(findSourceObjectOffset('const x = 1;', CARD_FILE, 27, 7), -1);
  });
});

describe('refineReactSourcePosition', () => {
  const routes = { 'https://app.test/src/Card.jsx': servedCardModule({ withMap: true }) };
  const opts = {
    pageOrigin: 'https://app.test',
    moduleUrl: 'https://app.test/src/Card.jsx',
    fetchImpl: routeFetch(routes),
  };

  it('maps the intermediate line-27 report to authored line 8', async () => {
    const hit = await refineReactSourcePosition({ file: CARD_FILE, line: 27, column: 7 }, opts);
    assert.deepEqual(hit, { file: 'Card.jsx', line: 7, column: 6 });
  });

  it('maps the h1 report to authored line 7, not the button line', async () => {
    const hit = await refineReactSourcePosition({ file: CARD_FILE, line: 26, column: 7 }, opts);
    assert.deepEqual(hit, { file: 'Card.jsx', line: 6, column: 6 });
  });

  // Real esbuild jsxDev maps the baked literal's whole generated line back to
  // the element's authored position — including its authored column — so two
  // elements indented differently refine to different columns (verified
  // against the e2e fixture's own esbuild: section (3,5), button (4,7)).
  function servedTwoColumnModule(): string {
    const body = [
      'import { jsxDEV } from "react/jsx-dev-runtime";',
      ...Array.from({ length: 18 }, () => '// filler'),
      '    /* @__PURE__ */ jsxDEV("button", { id: "widget-btn" }, void 0, false, {',
      `      fileName: "${CARD_FILE}",`,
      '      lineNumber: 4,',
      '      columnNumber: 7',
      '    }, this);',
      '    /* @__PURE__ */ jsxDEV("section", { id: "widget-root" }, void 0, false, {',
      `      fileName: "${CARD_FILE}",`,
      '      lineNumber: 3,',
      '      columnNumber: 5',
      '    }, this);',
      '//# sourceMappingURL=' + inlineMapURI([
        [21, 0, 0, 3, 6], // button literal's line → authored (1-based) (4,7)
        [26, 0, 0, 2, 4], // section literal's line → authored (1-based) (3,5)
      ]),
    ];
    return body.join('\n') + '\n';
  }

  it('refines each literal to its own authored line and column, not a shared one', async () => {
    const twoColOpts = {
      pageOrigin: 'https://twocol.test',
      moduleUrl: 'https://twocol.test/src/Card.jsx',
      fetchImpl: routeFetch({ 'https://twocol.test/src/Card.jsx': servedTwoColumnModule() }),
    };
    const button = await refineReactSourcePosition({ file: CARD_FILE, line: 4, column: 7 }, twoColOpts);
    assert.deepEqual(button, { file: 'Card.jsx', line: 3, column: 6 });
    const section = await refineReactSourcePosition({ file: CARD_FILE, line: 3, column: 5 }, twoColOpts);
    assert.deepEqual(section, { file: 'Card.jsx', line: 2, column: 4 });
    assert.notEqual(button?.column, section?.column);
  });

  it('returns null when the module map payload is malformed', async () => {
    const bad = 'data:application/json;base64,' + Buffer.from('not json at all').toString('base64');
    const hit = await refineReactSourcePosition(
      { file: CARD_FILE, line: 27, column: 7 },
      {
        pageOrigin: 'https://badmap.test',
        moduleUrl: 'https://badmap.test/src/Card.jsx',
        fetchImpl: routeFetch({
          'https://badmap.test/src/Card.jsx': servedCardModule({ withMap: false }) + '//# sourceMappingURL=' + bad + '\n',
        }),
      },
    );
    assert.equal(hit, null);
  });

  it('returns null when the module has no sourceMappingURL', async () => {
    const hit = await refineReactSourcePosition(
      { file: CARD_FILE, line: 27, column: 7 },
      {
        pageOrigin: 'https://app.test',
        moduleUrl: 'https://app.test/src/Plain.jsx',
        fetchImpl: routeFetch({ 'https://app.test/src/Plain.jsx': servedCardModule({ withMap: false }) }),
      },
    );
    assert.equal(hit, null);
  });

  it('returns null without a module URL or on cross-origin URLs', async () => {
    assert.equal(await refineReactSourcePosition({ file: CARD_FILE, line: 27 }, { ...opts, moduleUrl: null }), null);
    assert.equal(await refineReactSourcePosition({ file: CARD_FILE, line: 27 }, { ...opts, moduleUrl: undefined }), null);
    const hit = await refineReactSourcePosition(
      { file: CARD_FILE, line: 27, column: 7 },
      { ...opts, moduleUrl: 'https://evil.test/src/Card.jsx' },
    );
    assert.equal(hit, null);
  });
});

// ── Per-URL cache bounds ──
//
// Unique hosts per describe keep these fills from disturbing the caches the
// earlier suites rely on.

describe('resource text cache bounds', () => {
  const textOpts = (impl: typeof fetch) => ({ pageOrigin: 'https://lru-text.test', fetchImpl: impl });
  const url = (n: number) => `https://lru-text.test/r${n}`;

  it('caps at 32 entries, evicts least-recently-used, and refreshes on hit', async () => {
    const calls: Record<string, number> = {};
    const impl = ((url: string) => {
      calls[url] = (calls[url] ?? 0) + 1;
      return Promise.resolve({ ok: true, headers: { get: () => null }, text: () => Promise.resolve(`body:${url}`) });
    }) as unknown as typeof fetch;
    for (let n = 0; n < 32; n++) await fetchResourceText(url(n), textOpts(impl));
    await fetchResourceText(url(0), textOpts(impl)); // hit — refreshes 0 to most-recent
    assert.equal(calls[url(0)], 1);
    await fetchResourceText(url(32), textOpts(impl)); // cap exceeded — evicts r1, the LRU
    await fetchResourceText(url(0), textOpts(impl));
    assert.equal(calls[url(0)], 1, 'recently-used entry survives eviction');
    await fetchResourceText(url(1), textOpts(impl));
    assert.equal(calls[url(1)], 2, 'least-recently-used entry was evicted');
    assert.equal(Object.values(calls).reduce((a, b) => a + b, 0), 34);
  });

  it('caches misses under the same cap', async () => {
    const impl = ((url: string) => Promise.resolve({
      ok: false,
      headers: { get: () => null },
      text: () => Promise.resolve(''),
    })) as unknown as typeof fetch;
    const first = await fetchResourceText(url(100), textOpts(impl));
    const second = await fetchResourceText(url(100), textOpts(impl));
    assert.equal(first, null);
    assert.equal(second, null);
  });
});

describe('source map cache bounds', () => {
  it('caps at 32 entries and re-fetches the evicted entry', async () => {
    const calls: Record<string, number> = {};
    const impl = ((url: string) => {
      calls[url] = (calls[url] ?? 0) + 1;
      const json = JSON.stringify({ version: 3, sources: ['a.tsx'], names: [], mappings: buildMappings([[0, 0, 0, 0, 0]]) });
      return Promise.resolve({ ok: true, headers: { get: () => null }, text: () => Promise.resolve(json) });
    }) as unknown as typeof fetch;
    const mapOpts = { pageOrigin: 'https://lru-map.test', fetchImpl: impl };
    const murl = (n: number) => `https://lru-map.test/m${n}.map`;
    for (let n = 0; n < 33; n++) await loadSourceMap(murl(n), mapOpts);
    assert.equal(Object.keys(calls).length, 33);
    await loadSourceMap(murl(0), mapOpts);
    assert.equal(calls[murl(0)], 2, 'oldest entry was evicted when the cap was hit');
    await loadSourceMap(murl(32), mapOpts);
    assert.equal(calls[murl(32)], 1, 'most-recent entry survives');
  });
});
