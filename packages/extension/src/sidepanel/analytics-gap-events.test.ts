import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { boundedEvent, changeCountBucket, commandOutcome, messageFeatures, pageSchemeFromUrl, styleAnalytics, styleAnalyticsList, thrownFailure } from '../platform/analytics.ts';

const source = readFileSync(new URL('./sidepanel.ts', import.meta.url), 'utf8');
const run = (code: string, context: any) => runInNewContext(transformSync(code, { loader: 'ts' }).code, context);
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

describe('dm_panel_state', () => {
  const slice = source.slice(source.indexOf('let lastPanelBlock'), source.indexOf('let lastAnalyticsMcpState'));
  function panel() {
    const events: any[] = [];
    const context: any = { fileAccessBlocked: false, pageUnavailable: false, boundPageUrl: 'https://example.com/', pageSchemeFromUrl, trackFeature: (e: unknown) => events.push(e) };
    run(slice + '\nglobalThis.track = trackPanelState;', context);
    return { events, context };
  }
  it('reports each blocked state once, with the reason, and again only after the panel left it', () => {
    const { events, context } = panel();
    context.track(); assert.deepEqual(events, []);
    context.fileAccessBlocked = true; context.boundPageUrl = 'file:///x.html';
    context.track(); context.track();
    context.fileAccessBlocked = false; context.track();
    context.fileAccessBlocked = true; context.track();
    assert.deepEqual(plain(events), [
      { feature: 'panel_state', outcome: 'blocked', reason: 'file_access', page_scheme: 'file' },
      { feature: 'panel_state', outcome: 'blocked', reason: 'file_access', page_scheme: 'file' },
    ]);
  });
  it('tells a restricted page from other unavailable pages', () => {
    const { events, context } = panel();
    context.pageUnavailable = true; context.boundPageUrl = 'chrome://extensions/';
    context.track();
    context.boundPageUrl = ''; context.pageUnavailable = false; context.track();
    context.pageUnavailable = true; context.track();
    assert.deepEqual(plain(events).map((e: any) => e.reason), ['restricted_url', 'page_unavailable']);
  });
  it('accepts only its three reasons', () => {
    assert.equal(boundedEvent({ feature: 'panel_state', outcome: 'blocked', reason: 'file_access' })?.reason, 'file_access');
    assert.equal(boundedEvent({ feature: 'panel_state', outcome: 'blocked', reason: 'cloud_token_missing' })?.reason, undefined);
    assert.equal(boundedEvent({ feature: 'panel_state', outcome: 'blocked', reason: 'https://x.invalid' })?.reason, undefined);
  });
});

describe('dm_annotate cancel and dm_comment_update action', () => {
  const slice = source.slice(source.indexOf('function cancelComment()'), source.indexOf('function editComment('));
  function composer(over: Record<string, unknown>) {
    const events: any[] = [];
    const context: any = { regionCommentPending: false, awaitingRegionDraw: false, commentMode: false, commentText: '', editingCommentId: null, viewingCommentId: null, commentDirty: false, info: {},
      runInspectorAction() {}, send: async () => ({}), render() {}, trackFeature: (e: unknown) => events.push(e), ...over };
    run(slice + '\nglobalThis.api = { cancel: cancelComment, startRegion: startRegionComment };', context);
    return { events, context };
  }
  it('records a cancelled element annotation and a cancelled region, but not an abandoned edit of an existing comment', () => {
    const element = composer({ commentMode: true }); element.context.api.cancel();
    assert.deepEqual(plain(element.events), [{ feature: 'annotate', kind: 'element', outcome: 'cancelled' }]);
    const region = composer({ commentMode: true, regionCommentPending: true }); region.context.api.cancel();
    assert.deepEqual(plain(region.events), [{ feature: 'annotate', kind: 'region', outcome: 'cancelled' }]);
    const waiting = composer({ awaitingRegionDraw: true }); waiting.context.api.startRegion();
    assert.deepEqual(plain(waiting.events), [{ feature: 'annotate', kind: 'region', outcome: 'cancelled' }]);
    const edit = composer({ commentMode: true, editingCommentId: 'c1' }); edit.context.api.cancel();
    assert.deepEqual(edit.events, []);
    const idle = composer({}); idle.context.api.cancel();
    assert.deepEqual(idle.events, []);
  });
  it('comment edits and resolves are told apart by action', async () => {
    const sendSource = source.slice(source.indexOf('async function send('), source.indexOf('// file:// URLs have an empty hostname'));
    const events: any[] = [];
    const context: any = {
      messageFeatures, styleAnalytics, styleAnalyticsList, commandOutcome, thrownFailure, changeCountBucket, pageSchemeFromUrl, Object,
      mcpMode: 'cloud', siteChangeCount: () => 0, boundPageUrl: 'https://example.com/', myTabId: 1, IS_SAFARI: false,
      beginInspectorOperation: () => ({ assertCurrent() {}, wait: (p: Promise<any>) => p, isCurrent: () => true }),
      trackFeature: (e: unknown) => events.push(e), browser: { runtime: { sendMessage: async () => ({ ok: true }) } },
    };
    run(sendSource + '\nglobalThis.send = send;', context);
    await context.send({ type: 'SP_UPDATE_COMMENT', commentId: 'a', text: 'x' });
    await context.send({ type: 'SP_SET_COMMENT_RESOLVED', commentId: 'a', resolved: true });
    await context.send({ type: 'SP_SET_COMMENT_RESOLVED', commentId: 'a', resolved: false });
    const done = events.filter(e => e.outcome === 'command_acknowledged').map(e => [e.feature, e.action]);
    assert.deepEqual(plain(done), [['comment', 'edit'], ['comment', 'resolve'], ['comment', 'reopen']]);
  });
});
