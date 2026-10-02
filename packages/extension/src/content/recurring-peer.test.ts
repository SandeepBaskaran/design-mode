import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const matcher = fs.readFileSync(new URL('./multi-select.ts', import.meta.url), 'utf8');
const run = (code: string, context: Record<string, unknown>) => vm.runInNewContext(ts.transpile(code, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }), context);
const element = (id: string, className = 'recurring', options: { hidden?: boolean; internal?: boolean; parent?: string; tag?: string } = {}) => ({ id, className, tagName: options.tag || 'DIV', parentElement: { tagName: options.parent || 'SECTION' }, closest: () => options.internal, getBoundingClientRect: () => ({ width: options.hidden ? 0 : 10, height: 10 }) });
function matches(elements: ReturnType<typeof element>[], id = 'source') {
  const context: any = {
    exports: {}, getElementById: (id: string) => elements.find(e => e.id === id), getOrAssignId: (e: any) => e.id,
    document: { getElementsByTagName: (tag: string) => elements.filter(e => e.tagName === tag) },
  };
  run(matcher.slice(matcher.indexOf('const MAX_MATCHING'), matcher.indexOf('let active')), context);
  return Array.from(context.exports.findMatchingElements(id));
}

test('matching policy admits shared-class same-tag peers only, excluding hidden and extension nodes', () => {
  assert.deepEqual(matches([element('source'), element('peer1'), element('peer2', 'extra recurring'), element('outside', 'other'), element('hidden', 'recurring', { hidden: true }), element('internal', 'recurring', { internal: true }), element('wrong-tag', 'recurring', { tag: 'SPAN' })]), ['source', 'peer1', 'peer2']);
});
test('classless policy keeps same parent-tag boundary and ignores dm classes', () => {
  assert.deepEqual(matches([element('source', ''), element('peer', 'dm-transient'), element('other-parent', '', { parent: 'ARTICLE' }), element('classed', 'other')]), ['source', 'peer']);
});
test('matching cap stays at 100 including source; missing source cannot broaden a selector', () => {
  const peers = [element('source'), ...Array.from({ length: 150 }, (_, i) => element('peer' + i))];
  assert.equal(matches(peers).length, 100);
  assert.deepEqual(matches(peers, 'missing'), []);
});
test('payload counts use canonical matcher once per source, not saved selectors', () => {
  let calls = 0;
  const changes = [{ elementId: 'source', selector: '#unique' }, { elementId: 'source', selector: '#unique', property: 'color' }];
  const context: any = { getStyleChanges: () => changes, findMatchingElements: () => { calls++; return ['source', 'peer1', 'peer2']; }, getTextChanges: () => [], getDomChanges: () => [], getTokenEdits: () => [], getChangeComponentContexts: () => ({}) };
  run(source.slice(source.indexOf('function buildChangesPayload('), source.indexOf('async function getChangesPayload(')) + '\nresult = buildChangesPayload([]);', context);
  assert.equal(calls, 1);
  assert.deepEqual(Array.from(context.result.styleChanges, (c: any) => c.matchCount), [3, 3]);
});
test('batch snapshots canonical eligible peers without replaying source or changing selectors', async () => {
  const applied: unknown[] = [];
  const change = { id: 'change', elementId: 'source', selector: 'section > div.recurring:nth-of-type(1)', property: 'opacity', newValue: '0.5' };
  const context: any = { msg: { type: 'BATCH_APPLY_CHANGE', changeId: 'change' }, getStyleChanges: () => [change], findMatchingElements: (id: string) => { assert.equal(id, 'source'); return ['source', 'peer1', 'peer2']; }, applyStyleChange: (...args: unknown[]) => applied.push(args), getChangesPayload: async () => ({}), sendResponse: () => {} };
  const handler = source.slice(source.indexOf("    case 'BATCH_APPLY_CHANGE':"), source.indexOf("    case 'TOGGLE_VISIBILITY':"));
  run('function handle() { switch(msg.type) { ' + handler + '} } handle();', context);
  assert.deepEqual(applied, [['peer1', 'opacity', '0.5'], ['peer2', 'opacity', '0.5']]);
  assert.equal(change.selector, 'section > div.recurring:nth-of-type(1)');
});
