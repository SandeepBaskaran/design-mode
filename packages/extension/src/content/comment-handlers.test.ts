import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { validateImportPayload } from './import-validation';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
const functions = ['handleContentMessage', 'performFullClear', 'dispatchCloudMessage', 'buildChangesPayload', 'getChangesPayload'].map(name => {
  const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert.ok(node, name);
  return node.getText(ast);
});
const listener = ast.statements.find(n => ts.isExpressionStatement(n)
  && ts.isCallExpression(n.expression)
  && n.expression.expression.getText(ast) === 'browser.runtime.onMessage.addListener');
assert.ok(listener);
const code = ts.transpile([...functions, listener.getText(ast)].join('\n'), { target: ts.ScriptTarget.ES2022 });

function fixture() {
  const events: string[] = [];
  const relays: any[] = [];
  let handler: any;
  let failRead = false, failWrite = false;
  let durable: any[] = [];
  const context = vm.createContext({
    window: { __dmPreviewSaved: 'preview' }, location: { href: 'https://example.test' }, document: { title: 'Test' },
    dmIsActiveInstance: () => true,
    validateImportPayload,
    restoreOriginalPreview: () => { delete context.window.__dmPreviewSaved; },
    captureImportDomRollback: () => () => {},
    captureTrackerRollback: () => () => {},
    captureTokenRollback: () => () => {},
    captureCommentPinsRollback: () => () => {},
    persistImportedSession: async () => events.push('session'),
    browser: { runtime: { onMessage: { addListener: (fn: any) => { handler = fn; } } } },
    undoStack: [], redoStack: [], pageSessionStartedAt: 1, importInProgress: false,
    getSelectedElementId: () => null,
    getStyleChanges: () => [], getTextChanges: () => [], getDomChanges: () => [], getTokenEdits: () => [],
    getChangeComponentContexts: () => ({}), getChangeReport: () => ({}),
    getPageComments: async () => { if (failRead) throw Error('read failed'); return durable; },
    persistPageComments: async (comments: any[]) => {
      events.push('persist');
      if (failWrite) throw Error('write failed');
      durable = comments;
      return comments;
    },
    renderPageComments: () => events.push('pins'),
    setOverridesEnabled: () => events.push('overrides'),
    revertAllPageMutations: () => events.push('revert'),
    clearAllChanges: () => events.push('clear'),
    requestStopFeedback: () => {},
    clearAllTokenEdits: () => events.push('tokens'),
    clearAllLayoutGuides: () => events.push('guides'),
    syncAllChanges: () => events.push('sync'),
    applyChangesPayload: () => events.push('apply'),
    reorderChange: () => {}, exportMarkdown: () => 'markdown',
    setChangesStatus: () => { events.push('status'); return 1; },
    setCommentResolved: async () => { if (failWrite) throw Error('write failed'); },
    notifyPanel: (_type: string, data: any) => events.push(data.error ? 'panel-error' : 'panel-update'),
    sendRelayResponse: (id: string, data: any) => relays.push({ id, ...data }),
    buildMcpItems: () => [], buildCloudSessionSummary: (data: any) => data,
  });
  vm.runInContext(code, context);
  return {
    context, events, relays, durable: () => durable,
    failRead: (value = true) => { failRead = value; }, failWrite: (value = true) => { failWrite = value; },
    request: (msg: any) => new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('handler did not acknowledge')), 500);
      handler(msg, {}, (response: any) => { clearTimeout(timeout); resolve(response); });
    }),
    cloud: async (msg: any) => {
      context.dispatchCloudMessage(msg);
      await new Promise(resolve => setImmediate(resolve));
    },
  };
}

for (const msg of [
  { type: 'GET_CHANGES' }, { type: 'UNDO' }, { type: 'REDO' },
  { type: 'REORDER_CHANGE', from: 0, to: 1 }, { type: 'EXPORT', format: 'markdown' },
]) {
  it(`${msg.type} acknowledges a rejecting comment read, then recovers`, async () => {
    const f = fixture();
    f.failRead();
    const failed = await f.request(msg);
    assert.equal(failed.ok, false);
    assert.match(failed.error, /read failed/);
    f.failRead(false);
    assert.equal((await f.request(msg)).error, undefined);
  });
}

for (const type of ['CLEAR_CHANGES', 'IMPORT_CHANGES']) {
  it(`${type} leaves DOM, preview, trackers, pins and history untouched on failed persistence`, async () => {
    const f = fixture();
    f.context.undoStack.push('undo'); f.context.redoStack.push('redo');
    f.failWrite();
    const msg = { type, payload: { styleChanges: [], textChanges: [], domChanges: [], comments: [] } };
    assert.match((await f.request(msg)).error, /write failed/);
    assert.deepEqual(f.events, ['persist']);
    assert.equal(f.context.window.__dmPreviewSaved, 'preview');
    assert.equal(f.context.undoStack[0], 'undo');
    assert.equal(f.context.redoStack[0], 'redo');
    f.failWrite(false);
    if (type === 'CLEAR_CHANGES') f.failRead(); // No second storage read after the commit point.
    assert.equal((await f.request(msg)).ok, true);
    assert.ok(f.events.indexOf('revert') > f.events.lastIndexOf('persist'));
    assert.equal(f.context.undoStack.length, 0);
    assert.equal(f.context.redoStack.length, 0);
    assert.ok(f.events.includes('tokens'));
    assert.ok(f.events.includes('guides'));
    if (type === 'CLEAR_CHANGES') assert.ok(f.events.indexOf('sync') > f.events.indexOf('guides'));
    assert.equal(f.context.window.__dmPreviewSaved, undefined);
  });
}

for (const type of ['CLOUD_GET_CHANGES', 'CLOUD_GET_SESSION_SUMMARY', 'CLOUD_SET_CHANGE_STATUS']) {
  it(`${type} returns an explicit error instead of empty cloud success`, async () => {
    const f = fixture();
    f.failRead();
    await f.cloud({ type, requestId: 'request', payload: { status: 'resolved' } });
    assert.equal(f.relays.length, 1);
    assert.equal(f.relays[0].ok, false);
    assert.match(f.relays[0].error, /read failed/);
    assert.equal(f.events.includes('status'), false);
    f.failRead(false);
    await f.cloud({ type, requestId: 'retry', payload: { status: 'resolved' } });
    assert.equal(f.relays[1].error, undefined);
  });
}

it('cloud clear acknowledges failed writes and fire-and-forget status notifies the panel', async () => {
  const f = fixture();
  f.failWrite();
  await f.cloud({ type: 'CLOUD_CLEAR_CHANGES', requestId: 'clear' });
  assert.equal(f.relays[0].ok, false);
  assert.deepEqual(f.events, ['persist']);
  f.failRead();
  await f.cloud({ type: 'SET_CHANGE_STATUS', payload: { status: 'resolved' } });
  assert.ok(f.events.includes('panel-error'));
});

it('cloud status acknowledges a comment write failure without updating change status', async () => {
  const f = fixture();
  await f.context.persistPageComments([{ id: 'one' }]);
  f.failWrite();
  await f.cloud({ type: 'CLOUD_SET_CHANGE_STATUS', requestId: 'status', payload: { status: 'resolved' } });
  assert.equal(f.relays[0].ok, false);
  assert.match(f.relays[0].error, /write failed/);
  assert.equal(f.events.includes('status'), false);
});

for (const type of ['MARK_COMMENT_RESOLVED', 'CLOUD_MARK_COMMENT_RESOLVED']) {
  it(`${type} publishes resolved and reopened comments to the mounted panel`, async () => {
    const f = fixture();
    const comment = { id: 'one', resolved: false };
    await f.context.persistPageComments([comment]);
    const updates: any[] = [];
    f.context.setCommentResolved = async (_id: string, resolved: boolean) => {
      comment.resolved = resolved;
      return comment;
    };
    f.context.showCommentPins = async () => {};
    f.context.syncCommentChange = () => {};
    f.context.notifyPanel = (type: string, payload: any) => updates.push({ type, payload });
    for (const resolved of [true, false]) {
      await f.cloud({ type, requestId: 'resolve', payload: { commentId: 'one', resolved } });
      const update = updates.at(-1);
      assert.equal(update.type, 'CHANGES_UPDATE');
      assert.equal(update.payload.comments?.[0]?.id, 'one');
      assert.equal(update.payload.comments[0].resolved, resolved);
      assert.equal(f.relays.at(-1).ok, true);
    }
  });
}

it('every direct payload/comment read promise chain handles rejection', () => {
  const missing: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'then'
      && /^(getChangesPayload|getPageComments)\(\)$/.test(node.expression.expression.getText(ast))) {
      if (!(ts.isPropertyAccessExpression(node.parent) && node.parent.name.text === 'catch')) missing.push(node.getText(ast));
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.deepEqual(missing, []);
});
