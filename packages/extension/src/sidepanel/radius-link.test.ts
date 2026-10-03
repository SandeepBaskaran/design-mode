import { createInspectorOperation, runInspectorAction } from './inspector-operation';
const beginInspectorOperation = () => createInspectorOperation(() => 0, false);
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('./sidepanel.ts', import.meta.url), 'utf8');
const props = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'];
const body = source.slice(source.indexOf('async function applyStyle('), source.indexOf('  // Route virtual stroke props'));
const js = ts.transpile(body + '\nreturn "independent"; }', {target: ts.ScriptTarget.ES2022});
for (const linked of [false, true]) for (const prop of [...props, 'borderRadius']) {
  test(`radius dispatch ${linked ? 'linked' : 'unlinked'} ${prop}`, async () => {
    let batch: unknown;
    const context = {beginInspectorOperation, cornerRadiusLinked: linked, CORNER_RADIUS_PROPS: new Set(['borderRadius', ...props]), borderWidthLinked: false,
      applyStylesBatch: (changes: unknown, label: string) => { batch = JSON.parse(JSON.stringify({changes, label})); }};
    const result = await runInNewContext(js + `; applyStyle('${prop}', '13px');`, context);
    if (linked || prop === 'borderRadius') assert.deepEqual(batch, {changes: props.map(property => ({property, value:'13px'})), label:'Corner radius'});
    else { assert.equal(result, 'independent'); assert.equal(batch, undefined); }
  });
}
test('radius toggle is explicit and accessible; changes use a single dispatch', () => {
  assert.match(source, /data-dm-corner-link aria-label="Link corner radii" aria-pressed=/);
  assert.match(source, /if \(cornerLinkBtn\).*cornerRadiusLinked = !cornerRadiusLinked/);
  assert.doesNotMatch(source, /Promise.all\(borderRadii/);
});
test('Motion raw Transform shares the real CSS property and detects matrix-only transforms', () => {
  assert.match(source, /const transformIsSet = \(!!s.transform && s.transform !== 'none'\)/);
  const block = source.slice(source.indexOf('if (transformIsSet) motionRawPieces.push('), source.indexOf('// Motion Path —'));
  assert.match(block, /inp\('Transform', 'transform', s.transform \|\| 'none', ''\)/);
});
