import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFirefoxDock } from './firefox-dock';

function harness() {
  const calls: any[] = [];
  let windowId = 8, opened = false, refused = false;
  const api = {
    runtime: { getURL: (s: string) => 'moz-extension://fixture/' + s },
    tabs: { get: async (id: number) => ({ id, windowId }), update: async (id: number) => calls.push(['select', id]) },
    windows: { update: async (id: number) => { if (refused) throw Error('closed'); calls.push(['focus', id]); },
      remove: async (id: number) => calls.push(['remove', id]) },
    sidebarAction: { setPanel: async (options: any) => calls.push(['panel', options]),
      open: () => { throw Error('must never open without next gesture'); }, isOpen: async () => opened },
  };
  return { dock: createFirefoxDock(api), calls, open: () => { opened = true; },
    move: () => { windowId = 9; }, refuse: () => { refused = true; } };
}

test('prepare selects/focuses exact target without opening or closing surfaces', async () => {
  const h = harness(); await h.dock.begin(7, 20);
  assert.deepEqual(h.calls, [['panel', { windowId: 8, panel: 'moz-extension://fixture/sidepanel/index.html?dockTab=7' }], ['select', 7], ['focus', 8]]);
  assert.equal(h.dock.wantsSidebar({ id: 7, windowId: 8 }), true);
  assert.equal(h.dock.wantsSidebar({ id: 6, windowId: 8 }), false);
  assert.equal(h.dock.wantsSidebar({ id: 7, windowId: 9 }), false);
});
test('only initialized matching native sidebar can close the source; takeover is idempotent', async () => {
  const h = harness(); await h.dock.begin(7, 20);
  await h.dock.ready(6); assert.equal(h.calls.some(c => c[0] === 'remove'), false);
  h.open(); await h.dock.ready(7); await h.dock.ready(7);
  assert.deepEqual(h.calls.filter(c => c[0] === 'remove'), [['remove', 20]]);
  assert.equal(h.dock.wantsSidebar({ id: 7, windowId: 8 }), false);
  await h.dock.cancel(7); // late PiP pagehide must not reset the completed sidebar
  assert.deepEqual(h.calls.at(-1), ['remove', 20]);
  await h.dock.destinationClosed(7);
  assert.deepEqual(h.calls.at(-1), ['panel', { windowId: 8, panel: null }]);
});
test('moved target never hands off to old window and cancels override', async () => {
  const h = harness(); await h.dock.begin(7, 20); h.move(); h.open();
  await h.dock.ready(7); assert.equal(h.calls.some(c => c[0] === 'remove'), false);
  await h.dock.moved(7); assert.equal(h.dock.wantsSidebar({ id: 7, windowId: 8 }), false);
});
test('unpin/cancel and closing source disarm only their own handoff', async () => {
  const h = harness(); await h.dock.begin(7, 20); await h.dock.sourceClosed(21);
  assert.equal(h.dock.wantsSidebar({ id: 7, windowId: 8 }), true);
  await h.dock.sourceClosed(20); h.open(); await h.dock.ready(7);
  assert.equal(h.calls.some(c => c[0] === 'remove'), false);
  await h.dock.begin(7, 22); await h.dock.cancel(7); await h.dock.ready(7);
  assert.equal(h.calls.some(c => c[0] === 'remove'), false);
});
test('new target in same window supersedes old pending target', async () => {
  const h = harness(); await h.dock.begin(7, 20); await h.dock.begin(6, 21); h.open();
  await h.dock.ready(7); await h.dock.ready(6);
  assert.deepEqual(h.calls.filter(c => c[0] === 'remove'), [['remove', 21]]);
});
test('queued preparation is cancelled by closing source before async lookup', async () => {
  const h = harness(); const preparing = h.dock.begin(7, 20);
  await h.dock.sourceClosed(20); await preparing;
  assert.deepEqual(h.calls, []);
});
test('double click coalesces configuration and disconnected destination preserves source', async () => {
  const h = harness(); await Promise.all([h.dock.begin(7, 20), h.dock.begin(7, 20)]);
  assert.equal(h.calls.filter(c => c[0] === 'focus').length, 1);
  h.open(); await h.dock.ready(7, () => false);
  assert.equal(h.calls.some(c => c[0] === 'remove'), false);
  await h.dock.ready(7); assert.deepEqual(h.calls.at(-1), ['remove', 20]);
});
test('preparation failure disarms override but preserves source', async () => {
  const h = harness(); h.refuse(); await assert.rejects(h.dock.begin(7, 20), /closed/);
  assert.equal(h.dock.wantsSidebar({ id: 7, windowId: 8 }), false);
  assert.equal(h.calls.some(c => c[0] === 'remove'), false);
});
