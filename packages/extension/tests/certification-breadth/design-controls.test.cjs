const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');

const filename = path.join(__dirname, 'design-controls.cjs');
const source = fs.readFileSync(filename, 'utf8');
const ids = ['3.0', '3.1', '3.3', '3.4', '3.5', '3.6', '3.7', '3.9a', '3.9b', '3.10', '3.14', '3.15', '3.16', '3.17', '3.18', '3.19', '3.20', '3.23a', '3.24', '3.25', '3.26', '3.27', '3.28', '8.30'];

test('catalogue IDs are new, unique and all present in the manual plan', () => {
  const actual = [...source.matchAll(/await test\('([\d.]+[a-z]?)'/g)].map(m => m[1]);
  assert.deepEqual(actual, ids); assert.equal(new Set(actual).size, actual.length);
  const catalogue = fs.readFileSync(path.resolve(__dirname, '../../../../docs/e2e-testcases.md'), 'utf8');
  for (const id of ids) assert(new RegExp('\\|\\s*' + id.replaceAll('.', '\\.') + '\\s*\\|').test(catalogue), id);
  const baseline = new Set('2.1 2.2 2.9 2.13 2.22 2.7 3.2a 3.2 3.8 3.9 3.12 3.13 3.22 3.23 8.1 8.3 8.4 8.9 8.24 8.34 7.2 7.27 6.6'.split(' '));
  assert(ids.every(id => !baseline.has(id)));
});

test('panel dispatch is restricted to the existing named Firefox actions', () => {
  assert(source.includes("require('../certification/panel-actions.cjs')"));
  const actions = require('../certification/panel-actions.cjs');
  for (const match of source.matchAll(/h\.panel\(([^,\n)]+)/g)) {
    assert.match(match[1], /^A\.[a-zA-Z]+$/);
    assert.equal(typeof actions[match[1].slice(2)], 'function');
  }
});

test('fixture has unique local targets and no external resources', () => {
  const html = fs.readFileSync(path.join(__dirname, 'design-fixture.html'), 'utf8');
  const fixtureIds = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(fixtureIds).size, fixtureIds.length);
  for (const id of ['plain', 'decorated', 'border', 'radius', 'motion', 'layout', 'grid', 'auto', 'parking', 'scroll']) assert(fixtureIds.includes(id));
  assert.doesNotMatch(html, /https?:|<script|<link|<iframe/i);
});

test('injected navigation failure records every row and rejects the module', async () => {
  const out = fs.mkdtempSync(path.join(__dirname, '.design-contract-'));
  try {
    const sandbox = {require: createRequire(filename), module: {exports: {}}, process: {env:{}}, console: {log() {}}};
    vm.runInNewContext(source, sandbox, {filename});
    const actions = require('../certification/panel-actions.cjs');
    await assert.rejects(sandbox.module.exports({
      out, version: 'contract-test-not-a-browser', base: 'http://localhost:1',
      navigate: async () => {throw Error('injected navigation failure');},
      panel: async fn => {assert.equal(fn, actions.inspectSelector); return [];},
    }), /Design control breadth certification failed/);
    const result = JSON.parse(fs.readFileSync(path.join(out, 'rows.json'), 'utf8'));
    assert.deepEqual(result.rows.map(r => r.id), ids);
    assert.equal(result.supplemental.length, 5);
    for (const row of [...result.rows, ...result.supplemental]) {
      assert.equal(row.status, 'fail'); assert.match(row.error, /injected navigation failure/);
      for (const key of ['id', 'status', 'observed', 'remaining']) assert(Object.hasOwn(row, key));
    }
  } finally {fs.rmSync(out, {recursive: true, force: true});}
});
