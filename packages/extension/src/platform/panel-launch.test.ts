import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const compiled = ts.transpileModule(readFileSync(new URL('./panel.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(firefox = true, safari = false) {
  const calls: string[] = [];
  let opened = true;
  let moved: (id: number, details: { newWindowId: number }) => void;
  const browser = {
    tabs: { get: async () => ({ windowId: 8 }),
      update: async (id: number) => { calls.push(`select:${id}`); },
      onAttached: { addListener(fn: typeof moved) { moved = fn; } },
      onRemoved: { addListener() {} },
    },
    windows: { update: async (id: number) => { calls.push(`focus:${id}`); } },
    sidebarAction: { open: async () => { calls.push('open'); }, isOpen: async () => opened },
    sidePanel: { open: async (options: { tabId?: number }) => { calls.push(`chrome:${options.tabId}`); } },
  };
  const exports: any = {};
  vm.runInNewContext(compiled, { browser, chrome: browser, exports, setTimeout,
    require: () => ({ IS_FIREFOX: firefox, IS_SAFARI: safari }),
  });
  return { calls, api: exports, refuse: () => { opened = false; }, move: (id: number, w: number) => moved(id, { newWindowId: w }) };
}

test('Firefox refuses targeted one-gesture opening rather than racing focus', async () => {
  const h = harness();
  await h.api.preparePanelTarget(7);
  await assert.rejects(h.api.openPanel({ tabId: 7 }), /target window/);
  assert.deepEqual(h.calls, []);
});

test('Firefox command can synchronously open sidebar without a target cache', async () => {
  const h = harness();
  const opening = h.api.openPanel({});
  assert.deepEqual(h.calls, ['open']);
  await opening;
});

test('missing cache or refused target sidebar rejects rather than claiming successful docking', async () => {
  const h = harness();
  await assert.rejects(h.api.openPanel({ tabId: 7 }), /not ready/);
  assert.deepEqual(h.calls, []);
  await h.api.preparePanelTarget(7);
  h.refuse();
  await assert.rejects(h.api.openPanel({ tabId: 7 }), /target window/);
});

test('moving a target tab updates docking destination', async () => {
  const h = harness();
  await h.api.preparePanelTarget(7);
  h.move(7, 9);
  await assert.rejects(h.api.openPanel({ tabId: 7 }), /target window/);
  assert.deepEqual(h.calls, []);
});

test('Chrome keeps its synchronous tab-specific gesture path; Safari is a no-op', async () => {
  const chrome = harness(false);
  const opening = chrome.api.openPanel({ tabId: 7 });
  assert.deepEqual(chrome.calls, ['chrome:7']);
  await opening;
  const safari = harness(false, true);
  await safari.api.openPanel({ tabId: 7 });
  assert.deepEqual(safari.calls, []);
});
