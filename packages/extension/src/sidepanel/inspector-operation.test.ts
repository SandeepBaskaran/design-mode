import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createInspectorOperation, InspectorOperationCancelled, runInspectorAction } from './inspector-operation.ts';
import { changeGroupKey, styleChangeGroupKey, collectGroupRevertIds } from './change-group.ts';

// Execute the actual production function declarations, not replicas of their
// loops. The panel's module startup needs a browser DOM; these workflows only
// need its state and RPC boundary, supplied below.
const source = readFileSync(new URL('./sidepanel.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('sidepanel.ts', source, ts.ScriptTarget.Latest, true);
const names = new Set(['beginInspectorOperation', 'send', 'revertGroup', 'submitComment', 'refreshChanges', 'refreshState', 'refreshDesignSystem', 'clearAllChanges']);
const declarations: string[] = [];
parsed.forEachChild(node => {
  if (ts.isFunctionDeclaration(node) && names.has(node.name?.text || '')) declarations.push(node.getText(parsed));
});
assert.equal(declarations.length, names.size);
const production = ts.transpileModule(declarations.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function deferred() {
  let resolve!: (value: any) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function panel(safari = true) {
  const requests: any[] = [];
  const first = deferred();
  const state: any = {
    createInspectorOperation, changeGroupKey, styleChangeGroupKey, collectGroupRevertIds,
    IS_SAFARI: safari, inspectorEpoch: 0, myTabId: 11,
    browser: { runtime: { sendMessage(message: any) { requests.push(message); return requests.length === 1 ? first.promise : Promise.resolve({ styleChanges: [], comments: [] }); } } },
    styleChanges: [{ id: 'style-a', elementId: 'hero' }, { id: 'style-b', elementId: 'hero' }],
    textChanges: [], domChanges: [], comments: [], tokenChanges: [], componentContexts: {},
    batchAppliedChanges: new Set(), editedTokens: new Map(),
    messageFeatures: {}, trackFeature() {}, commandOutcome: () => ({}),
    commentSubmitting: false, changesGrouping: 'element', changesRequest: 0,
    pageGeneration: 0, pageUnavailable: false, pageNavigating: false, activeRouteKey: '', changesPageUrl: '',
    routeGroups: [], routeEditingBlocked: false, showCaptureToast() {},
    render() {}, inspectorError: '',
    editingCommentId: 'old-note', commentText: 'edited', regionCommentPending: false, commentMode: true,
    enabled: true, inspecting: true, undoCount: 0, redoCount: 0,
    designSystemInflight: false, designSystem: null,
  };
  vm.createContext(state);
  vm.runInContext(production, state);
  function switchTarget() {
    state.inspectorEpoch++;
    state.myTabId = 22;
    state.styleChanges = [{ id: 'new-page', elementId: 'hero' }];
    state.comments = [{ id: 'new-comment' }];
    state.commentText = 'new draft';
    state.editingCommentId = 'new-note';
  }
  return { state, requests, first, switchTarget };
}

describe('inspector operation cancellation', () => {
  for (const reject of [false, true]) {
    it(`group revert stops after target change (${reject ? 'rejected' : 'resolved'} RPC)`, async () => {
      const p = panel();
      const pending = p.state.revertGroup('hero');
      p.switchTarget();
      if (reject) p.first.reject(new Error('bridge reset')); else p.first.resolve({});
      await assert.rejects(pending, InspectorOperationCancelled);
      assert.deepEqual(p.requests.map(r => [r.type, r.targetTabId]), [['SP_REMOVE_CHANGE', 11]]);
      assert.equal(p.state.styleChanges[0].id, 'new-page');
    });
  }
  it('comment edit never adds the old comment to the newly selected page', async () => {
    const p = panel();
    const pending = p.state.submitComment();
    p.switchTarget(); p.first.resolve({});
    await assert.rejects(pending, InspectorOperationCancelled);
    assert.equal(p.requests.length, 1);
    assert.equal(p.state.editingCommentId, 'new-note');
    assert.equal(p.state.commentText, 'new draft');
  });
  it('stale refresh cannot clear or replace the new page changes/comments', async () => {
    const p = panel();
    const pending = p.state.refreshChanges();
    p.switchTarget(); p.first.resolve({ styleChanges: [], comments: [] });
    await assert.rejects(pending, InspectorOperationCancelled);
    assert.equal(p.state.styleChanges[0].id, 'new-page');
    assert.equal(p.state.comments[0].id, 'new-comment');
  });
  it('a pre-cancelled operation cannot stamp a request with the new tab', async () => {
    const p = panel(); const op = p.state.beginInspectorOperation();
    p.switchTarget();
    await assert.rejects(p.state.refreshChanges(op), InspectorOperationCancelled);
    assert.equal(p.requests.length, 0);
  });
  it('stale finally does not clear the new target inflight state', async () => {
    const p = panel(); const pending = p.state.refreshDesignSystem();
    p.switchTarget(); p.state.designSystemInflight = true; p.first.resolve({});
    await assert.rejects(pending, InspectorOperationCancelled);
    assert.equal(p.state.designSystemInflight, true);
  });
  it('current-target RPC failure aborts group revert rather than looking successful', async () => {
    const p = panel(); const pending = p.state.revertGroup('hero');
    const error = new Error('RPC failed'); p.first.reject(error);
    await assert.rejects(pending, e => e === error);
    assert.equal(p.requests.length, 1);
  });
  it('successful comment edit updates atomically and refreshes on its original target', async () => {
    const p = panel(); const pending = p.state.submitComment(); p.first.resolve({ comment: { id: 'old-note' } }); await pending;
    assert.deepEqual(p.requests.map(r => r.type), ['SP_UPDATE_COMMENT', 'SP_GET_CHANGES']);
    assert.ok(p.requests.every(r => r.targetTabId === 11));
  });
  it('successful group revert completes all removals and reconciliation', async () => {
    const p = panel(); const pending = p.state.revertGroup('hero'); p.first.resolve({}); await pending;
    assert.deepEqual(p.requests.map(r => r.type), ['SP_REMOVE_CHANGE', 'SP_REMOVE_CHANGE', 'SP_GET_CHANGES', 'SP_GET_STATE']);
  });
  it('Chrome/Firefox retain existing changes on a disconnected refresh', async () => {
    const p = panel(false); const pending = p.state.refreshChanges();
    p.first.reject(new Error('no receiver')); await pending;
    assert.equal(p.state.styleChanges[0].id, 'style-a');
  });
  it('reported RPC errors abort comment edits before the add request', async () => {
    const p = panel(); const pending = p.state.submitComment();
    p.first.resolve({ error: 'No inspected document' });
    await assert.rejects(pending, /No inspected document/);
    assert.equal(p.requests.length, 1);
    assert.equal(p.state.editingCommentId, 'old-note');
  });
  it('comment cancellation during atomic update preserves the new-page composer', async () => {
    const p = panel();
    const pending = p.state.submitComment();
    assert.equal(p.requests.length, 1);
    assert.equal(p.requests[0].type, 'SP_UPDATE_COMMENT');
    p.switchTarget(); p.state.commentSubmitting = true;
    p.first.resolve({ comment: { id: 'old-note' } });
    await assert.rejects(pending, InspectorOperationCancelled);
    assert.equal(p.requests.length, 1);
    assert.equal(p.state.commentText, 'new draft');
    assert.equal(p.state.commentSubmitting, true);
  });
  it('rejected stale refresh leaves new-page state intact', async () => {
    const p = panel(); const pending = p.state.refreshChanges();
    p.switchTarget(); p.first.reject(new Error('document closed'));
    await assert.rejects(pending, InspectorOperationCancelled);
    assert.equal(p.state.styleChanges[0].id, 'new-page');
    assert.equal(p.state.inspectorError, '');
  });
  it('UI boundary consumes only explicit cancellation', async () => {
    assert.equal(await runInspectorAction(Promise.reject(new InspectorOperationCancelled())), undefined);
    const error = new Error('unexpected');
    await assert.rejects(runInspectorAction(Promise.reject(error)), e => e === error);
  });
});


describe('incoming site-wide operation cancellation', () => {
  it('a site clear cannot reconcile or clear caches on a new Inspector target', async () => {
    const p = panel();
    const pending = p.state.clearAllChanges();
    assert.equal(p.requests[0].type, 'SP_CLEAR_SITE_CHANGES');
    p.switchTarget(); p.state.editedTokens.set('new-token', true);
    p.first.resolve({ ok: true });
    await assert.rejects(pending, InspectorOperationCancelled);
    assert.equal(p.requests.length, 1);
    assert.equal(p.state.editedTokens.has('new-token'), true);
    assert.equal(p.state.styleChanges[0].id, 'new-page');
  });
});
