import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { state, type ChangeSession, type StyleChange } from '../src/state.ts';
import { executeLocalTool } from '../src/tools.ts';

const A = 'https://example.test/a';
const B = 'https://example.test/b';
const style = (id: string, pageUrl: string, newValue: string) => ({
  id, elementId: id, selector: 'h1', property: 'color', oldValue: 'black', newValue,
  timestamp: 1, pageUrl, routeKey: pageUrl, cssRule: `h1 { color: ${newValue}; }`,
});

function sessionUpdate() {
  const styleChanges = [style('a', A, 'red'), style('b', B, 'blue')];
  const textChanges = [A, B].map((pageUrl, i) => ({
    id: `t${i}`, elementId: `t${i}`, selector: 'h1', oldText: 'old', newText: `new${i}`,
    timestamp: 1, pageUrl, routeKey: pageUrl, attributeName: 'title',
  }));
  const domChanges = [A, B].map((pageUrl, i) => ({
    id: `d${i}`, elementId: `d${i}`, selector: 'h1', action: 'delete' as const,
    tagName: 'H1', timestamp: 1, pageUrl, routeKey: pageUrl,
  }));
  const comments = [A, B].map((pageUrl, i) => ({
    id: `c${i}`, elementId: `c${i}`, selector: 'h1', text: `note${i}`,
    timestamp: 1, updatedAt: 1, pageUrl, routeKey: pageUrl,
  }));
  const payload = {
    pageUrl: A, pageTitle: 'A', cssBlock: '', styleChanges, textChanges, domChanges, comments,
    routeGroups: [A, B].map((url, i) => ({
      url, routeKey: url, styleChanges: [styleChanges[i]], textChanges: [textChanges[i]],
      domChanges: [domChanges[i]], comments: [comments[i]],
    })),
  } satisfies ChangeSession;
  // Same state path as websocket-server's SESSION_UPDATE; no server or relay.
  state.updateSession(payload);
  state.getOrCreateSession(payload.pageUrl, payload.pageTitle);
  state.replaceChanges(payload);
  return payload;
}

beforeEach(() => state.clear());

for (const format of ['css', 'scss', 'tailwind', 'jsx']) {
  test(`${format} export preserves identical selectors on different routes`, async () => {
    sessionUpdate();
    const result = await executeLocalTool('export_changes', { format });
    assert.equal(result.isError, undefined);
    const text = result.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
    assert.ok(text.includes(A));
    assert.ok(text.includes(B));
    assert.ok(text.includes('red'));
    assert.ok(text.includes('blue'));
  });
}

test('SESSION_UPDATE retains two routes with the same selector/property through handoff reports', () => {
  sessionUpdate();
  state.setHandoff({ requestedAt: 1, pageUrl: A, pageTitle: 'A' });
  const report: any = state.getFullChangeReport();
  assert.deepEqual(report.styleChanges.map((c: any) => [c.pageUrl, c.routeKey, c.selector, c.property, c.newValue]), [
    [A, A, 'h1', 'color', 'red'], [B, B, 'h1', 'color', 'blue'],
  ]);
  assert.equal(report.routeGroups.length, 2);
  for (const [i, url] of [A, B].entries()) {
    const group = report.routeGroups[i];
    assert.equal(group.url, url);
    assert.equal(group.routeKey, url);
    assert.equal(group.styleChanges.length, 1);
    assert.equal(group.styleChanges[0].newValue, i ? 'blue' : 'red');
    assert.equal(group.cssBlock, `h1 {\n  color: ${i ? 'blue' : 'red'};\n}`);
    for (const kind of ['style', 'text', 'dom', 'comment']) {
      const item = report.items.find((c: any) => c.kind === kind && c.pageUrl === url);
      assert.ok(item);
      assert.equal(item.routeKey, url);
    }
    for (const key of ['textChanges', 'domChanges', 'comments']) {
      assert.equal(report[key][i].pageUrl, url);
      assert.equal(report[key][i].routeKey, url);
    }
  }
  assert.equal(report.cssBlock, `/* Route: ${A} */\nh1 {\n  color: red;\n}\n\n/* Route: ${B} */\nh1 {\n  color: blue;\n}`);
  assert.equal(report.handoff.pageUrl, A);
  assert.equal(report.handoff.requestedAt, new Date(1).toISOString());
});

test('route groups reflect live events, statuses and comment deletions rather than a stale snapshot', () => {
  const payload = sessionUpdate();
  const { pageUrl: _pageUrl, routeKey: _routeKey, ...incremental } = payload.styleChanges[1];
  state.addStyleChange({ ...incremental, newValue: 'green' });
  state.setChangeStatus('resolved', ['b', 't1', 'd1', 'c1']);
  state.deleteComment('c0');
  const report: any = state.getFullChangeReport();
  assert.equal(report.styleChanges[1].newValue, 'green');
  assert.equal(report.routeGroups[1].styleChanges[0].newValue, 'green');
  assert.match(report.routeGroups[1].cssBlock, /color: green;/);
  assert.equal(report.routeGroups[1].styleChanges[0].status, 'resolved');
  assert.equal(report.routeGroups[1].textChanges[0].status, 'resolved');
  assert.equal(report.routeGroups[1].domChanges[0].status, 'resolved');
  assert.equal(report.routeGroups[1].comments[0].resolved, true);
  assert.deepEqual(report.routeGroups[0].comments, []);
  assert.equal(report.items.find((c: any) => c.id === 'b').status, 'resolved');
});

test('pageUrl alone isolates routes and CSS labels cannot terminate comments', () => {
  const a: StyleChange = style('a', A, 'red');
  const b: StyleChange = style('b', `${B}*/`, 'blue');
  delete a.routeKey;
  delete b.routeKey;
  state.replaceChanges({ styleChanges: [a, b] });
  const report: any = state.getFullChangeReport();
  assert.equal(report.styleChanges.length, 2);
  assert.match(report.cssBlock, /b\* \/ \*\//);
});

test('tool exports escape route comments and preserve unlabelled legacy output', async () => {
  const change: StyleChange = style('a', `${A}*/\nbody {}`, 'red');
  delete change.routeKey;
  state.replaceChanges({ styleChanges: [change] });
  const labelled = await executeLocalTool('export_changes', { format: 'css' });
  assert.equal(labelled.content[0].type, 'text');
  if (labelled.content[0].type !== 'text') return;
  assert.ok(labelled.content[0].text.startsWith(`/* Route: ${A}* / body {} */\n`));
  delete change.pageUrl;
  state.replaceChanges({ styleChanges: [change] });
  const legacy = await executeLocalTool('export_changes', { format: 'css' });
  assert.deepEqual(legacy.content, [{ type: 'text', text: 'h1 {\n  color: red;\n}' }]);
});

test('legacy single-page changes keep the old sparse shape and property consolidation', () => {
  const legacy: StyleChange = { id: 'old', elementId: 'e', selector: 'h1', property: 'color', oldValue: 'black', newValue: 'red', timestamp: 1 };
  state.replaceChanges({ styleChanges: [legacy, { ...legacy, id: 'new', newValue: 'blue' }] });
  const report: any = state.getFullChangeReport();
  assert.deepEqual(report.styleChanges, [{ selector: 'h1', property: 'color', oldValue: 'black', newValue: 'blue', cssRule: 'h1 { color: blue; }' }]);
  assert.equal(report.cssBlock, 'h1 {\n  color: blue;\n}');
  assert.equal('routeGroups' in report, false);
  assert.equal('pageUrl' in report.items[0], false);
});

test('complete snapshots remove dropped entries and clear removes route groups', () => {
  const payload = sessionUpdate();
  const next = { ...payload, styleChanges: [], textChanges: [], domChanges: [], comments: [] };
  state.updateSession(next);
  state.replaceChanges(next);
  const report: any = state.getFullChangeReport();
  assert.deepEqual(report.items, []);
  assert.equal(report.routeGroups[0].styleChanges.length, 0);
  assert.equal(report.routeGroups[1].comments.length, 0);
  state.clear();
  assert.equal('routeGroups' in state.getFullChangeReport(), false);
});
