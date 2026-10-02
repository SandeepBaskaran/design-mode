import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { isAnalyticsSender } from '../platform/analytics.ts';
import { createCommentStore } from '../background/comment-store';

const source = readFileSync(new URL('../background/index.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('background.ts', source, ts.ScriptTarget.Latest, true);
function fixture(protocol = 'chrome-extension:') {
  const runtime = { id: 'extension', getURL: (path: string) => `${protocol}//extension/${path}` };
  const calls: any[] = [];
  let handler: any;
  let storageReads = 0;
  const store = createCommentStore({ get: async () => { storageReads++; return {}; }, set: async () => {} });
  const statement = ast.statements.find(n => ts.isExpressionStatement(n) && ts.isCallExpression(n.expression)
    && n.expression.expression.getText(ast) === 'browser.runtime.onMessage.addListener');
  assert.ok(statement);
  const context = vm.createContext({
    URL, Error, isAnalyticsSender, currentTargetTab: null, COMMENT_STORE_ERROR: 'rejected', COMMENT_PAGE_ERROR: 'damaged',
    commentStore: async (operation: unknown, senderUrl: string) => { calls.push([operation, senderUrl]); return store(operation, senderUrl); },
    forwardToPinnedTab: (message: any, reply: any) => { calls.push({ message, tabId: context.currentTargetTab }); reply({ ok: true }); },
    browser: { runtime: { ...runtime, onMessage: { addListener: (fn: any) => { handler = fn; } } },
      tabs: { sendMessage: async (tabId: number, message: any) => { calls.push({ tabId, message }); return { ok: true }; } } },
  });
  vm.runInContext(ts.transpile(statement.getText(ast), { target: ts.ScriptTarget.ES2022 }), context);
  return { calls, runtime, get storageReads() { return storageReads; },
    request: (msg: any, sender: any) => new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`No acknowledgement for ${msg.type}`)), 500);
      try { handler(msg, sender, (response: any) => { clearTimeout(timer); resolve(response); }); }
      catch (error) { clearTimeout(timer); reject(error); }
    }) };
}

it('broker rejects content-script panel commands and invalid target tab IDs', async () => {
  const f = fixture();
  for (const sender of [{ id: 'foreign', url: f.runtime.getURL('sidepanel/index.html') },
    { id: 'extension', url: 'https://page.test/', tab: { id: 1 } }]) {
    assert.equal((await f.request({ type: 'SP_CLEAR_CHANGES', targetTabId: 2 }, sender)).ok, false);
  }
  const sender = { id: 'extension', url: f.runtime.getURL('sidepanel/index.html') };
  for (const targetTabId of [-1, 0.5, NaN, Infinity, '2', null]) {
    assert.equal((await f.request({ type: 'SP_GET_STATE', targetTabId }, sender)).ok, false);
  }
  assert.equal(f.calls.length, 0);
});

it('broker keeps Chrome/Firefox panel, popout and PiP-opener routing', async () => {
  for (const protocol of ['chrome-extension:', 'moz-extension:']) {
    const f = fixture(protocol);
    for (const suffix of ['', '?popout=1&tabId=7', '?popout=1&tabId=7&pip=1']) {
      const sender = { id: 'extension', url: f.runtime.getURL('sidepanel/index.html') + suffix, tab: { id: 99 } };
      assert.equal((await f.request({ type: 'SP_GET_STATE', targetTabId: 7 }, sender)).ok, true);
      assert.equal(f.calls.at(-1).tabId, 7);
    }
  }
});

it('legacy content requests cannot choose another tab', async () => {
  const f = fixture();
  const sender = { id: 'extension', url: 'https://page.test/', tab: { id: 1 } };
  for (const type of ['GET_STATE', 'TOGGLE_DESIGN_MODE']) {
    assert.equal((await f.request({ type, tabId: 2 }, sender)).ok, false);
    assert.equal((await f.request({ type, tabId: 1 }, sender)).ok, true);
  }
  assert.equal(f.calls.length, 2);
  assert.ok(f.calls.every(call => call.tabId === 1));
});

it('panel ports validate sender and full tab syntax without rejecting popout/PiP', async () => {
  const statement = ast.statements.find(n => ts.isExpressionStatement(n) && ts.isCallExpression(n.expression)
    && n.expression.expression.getText(ast) === 'browser.runtime.onConnect.addListener');
  assert.ok(statement);
  for (const protocol of ['chrome-extension:', 'moz-extension:']) {
    const runtime = { id: 'extension', getURL: (path: string) => `${protocol}//extension/${path}` };
    const panelPorts = new Map();
    let connect: any;
    const context = vm.createContext({ URL, isAnalyticsSender, panelPorts, panelSurfaces: new Map(),
      transitioningTabs: new Set(), pinnedTabId: null, pinnedTabUrl: null, isScriptableUrl: () => false,
      browser: { runtime: { ...runtime, onConnect: { addListener: (fn: any) => { connect = fn; } } },
        tabs: { get: async (id: number) => ({ id, url: 'https://page.test/' }),
          query: async () => [{ id: 7, url: 'https://page.test/' }] } },
    });
    vm.runInContext(ts.transpile(statement.getText(ast), { target: ts.ScriptTarget.ES2022 }), context);
    const port = (name: string, url = runtime.getURL('sidepanel/index.html')) => ({ name,
      sender: { id: runtime.id, url, tab: { id: 99 } }, postMessage() {}, onDisconnect: { addListener() {} } });
    for (const name of ['sidepanel:7evil', 'sidepanel:-1', 'sidepanel:1.5', 'sidepanel:Infinity', 'sidepanel:7:other']) connect(port(name));
    connect(port('sidepanel:7', 'https://attacker.test/'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(panelPorts.size, 0);
    for (const name of ['sidepanel', 'sidepanel:7', 'sidepanel:7:popout', 'sidepanel:7:pip']) connect(port(name));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(panelPorts.size, 4);
    assert.ok([...panelPorts.values()].every(id => id === 7));
  }
});

it('comment storage validates the sender origin, including child frames', async () => {
  const f = fixture();
  const sender = { id: 'extension', url: 'https://frame.test/path#hash', frameId: 4, tab: { id: 1, url: 'https://top.test/' } };
  assert.equal((await f.request({ type: 'DM_COMMENT_STORE', operation: { action: 'read', href: 'https://victim.test/' } }, sender)).ok, false);
  assert.equal(f.storageReads, 0);
  assert.equal((await f.request({ type: 'DM_COMMENT_STORE', operation: { action: 'read', href: sender.url } }, sender)).ok, true);
  assert.equal(f.calls[1][1], sender.url);
  assert.equal(f.storageReads, 1);
});
