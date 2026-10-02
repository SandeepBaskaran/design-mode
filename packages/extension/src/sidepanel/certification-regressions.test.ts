import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../content/index.ts', import.meta.url), 'utf8');
const match = source.match(/case 'INSPECT_PAGE': \{([\s\S]*?)\n      break;\n    \}/);
assert.ok(match);
for (const scenario of ['none', 'detached', 'selected'] as const) {
  test(`page inspection preserves only a resolved explicit selection: ${scenario}`, () => {
    let selected: string | null = scenario === 'none' ? null : scenario;
    let explicit = scenario !== 'none';
    let response: any;
    const context = {
      getSelectedElementId: () => selected,
      getElementById: (id: string) => id === 'selected' ? { id } : null,
      document: { body: { id: 'body' } },
      buildElementInfo: (element: { id: string }) => ({ id: element.id }),
      setSelectedElementId: (id: string, value: boolean) => { selected = id; explicit = value; },
      getLayoutGuidesFor: () => [],
      sendResponse: (value: unknown) => { response = value; },
    };
    runInNewContext(match[1], context);
    assert.equal(selected, scenario === 'selected' ? 'selected' : 'body');
    assert.equal(response.payload.id, selected);
    assert.equal(explicit, scenario === 'selected');
  });
}

const panel = readFileSync(new URL('./sidepanel.ts', import.meta.url), 'utf8');
const expression = panel.match(/const previewSrc = (.*);/);
assert.ok(expression);
for (const markup of ['<svg>valid 😀</svg>', '<svg>\ud800</svg>', '<svg>\udc00</svg>']) {
  test(`SVG image preview encodes page text safely: ${JSON.stringify(markup)}`, () => {
    const result = runInNewContext(expression[1], { m: { markup, src: 'blob:page' }, TextEncoder, TextDecoder });
    assert.equal(result.startsWith('data:image/svg+xml;charset=utf-8,'), true);
    const decoded = decodeURIComponent(result.split(',')[1]);
    assert.equal(decoded, new TextDecoder().decode(new TextEncoder().encode(markup)));
  });
}
