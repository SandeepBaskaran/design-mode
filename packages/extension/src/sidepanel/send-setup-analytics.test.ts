import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { boundedEvent, pageSchemeFromUrl, sendToAgentBlock, SETUP_POPUP_STEPS } from '../platform/analytics.ts';
import { renderSendSetupDialog, sendSetupStep } from './send-setup.ts';

const source = readFileSync(new URL('./sidepanel.ts', import.meta.url), 'utf8');
const slice = source.slice(source.indexOf('function focusSendSetup('), source.indexOf('/* ── Phase 2: Layers Tab ── */'));

// Runs the real popup lifecycle functions from sidepanel.ts against a fake panel state.
function harness(start: { mcpState: string; mcpMode: string; mcpCloudToken: string; mcpStatusIssue?: string }) {
  const events: any[] = [];
  let now = 1_000_000;
  const dialog = { focus() {}, querySelector: () => null, contains: () => true };
  const context: any = {
    ...start, mcpStatusIssue: start.mcpStatusIssue || '', boundPageUrl: 'https://example.com/',
    sendSetupOpen: false, sendSetupChecking: false, sendSetupTrigger: null, sendSetupTimer: null, sendSetupBusy: false, sendSetupPolls: 0,
    sendSetupOpenedAt: 0, sendSetupReason: '', sendSetupResolved: false,
    sendToAgentBlock, pageSchemeFromUrl, sendSetupStep, sendSetupModel: () => ({ mode: context.mcpMode, state: context.mcpState, statusIssue: context.mcpStatusIssue, hasToken: !!context.mcpCloudToken }),
    trackFeature: (e: unknown) => events.push(e),
    Date: { now: () => now }, HTMLElement: class {},
    document: { activeElement: null, body: {} }, requestAnimationFrame() {}, setInterval: () => 1, clearInterval() {},
    root: { querySelector: () => dialog }, render() {}, refreshMcpStatus: async () => {}, send: async () => ({}), AnalyticsEventTypeOnly: undefined,
  };
  runInNewContext(transformSync(slice + '\nglobalThis.api = { open: openSendSetup, close: closeSendSetup, probe: probeSendSetup, resolved: noteSendSetupResolved };', { loader: 'ts' }).code, context);
  return { events, ctx: context, advance: (ms: number) => { now += ms; } };
}

describe('setup popup analytics lifecycle', () => {
  it('shown once with the blocker reason; auto re-check resolves once, with the time taken', async () => {
    const h = harness({ mcpState: 'offline', mcpMode: 'cloud', mcpCloudToken: '' });
    h.ctx.api.open();
    h.ctx.api.open(); // a second open call while already open is not a new popup
    assert.deepEqual(h.events.map(e => e.outcome), ['shown']);
    assert.equal(h.events[0].feature, 'setup_popup');
    assert.equal(h.events[0].reason, 'cloud_token_missing');
    assert.equal(h.events[0].mode, 'cloud');
    h.advance(7400);
    await h.ctx.api.probe();
    assert.equal(h.events.length, 1, 'still blocked: nothing resolved');
    h.ctx.mcpCloudToken = 'dm_x'; h.ctx.mcpState = 'connected';
    h.advance(1000);
    await h.ctx.api.probe();
    await h.ctx.api.probe();
    const resolved = h.events.filter(e => e.outcome === 'resolved');
    assert.equal(resolved.length, 1);
    assert.deepEqual([resolved[0].reason, resolved[0].resolved_via, resolved[0].time_to_resolve_ms], ['cloud_token_missing', 'auto_recheck', 8400]);
    h.ctx.api.close();
    assert.ok(!h.events.some(e => e.outcome === 'dismissed'), 'closing a resolved popup is not a dismissal');
  });

  it('dismissed once, with time open, when closed without fixing', () => {
    const h = harness({ mcpState: 'running', mcpMode: 'local', mcpCloudToken: '' });
    h.ctx.api.open();
    h.advance(3000);
    h.ctx.api.close();
    h.ctx.api.close();
    assert.deepEqual(h.events.map(e => e.outcome), ['shown', 'dismissed']);
    assert.equal(h.events[1].reason, 'no_agent_connected');
    assert.equal(h.events[1].time_open_ms, 3000);
  });

  it('the Send button path reports send_button, and close(false) after it is not a dismissal', () => {
    const h = harness({ mcpState: 'offline', mcpMode: 'local', mcpCloudToken: '' });
    h.ctx.api.open();
    h.ctx.mcpState = 'connected';
    h.advance(2000);
    h.ctx.api.resolved('send_button');
    h.ctx.api.close(false);
    assert.deepEqual(h.events.map(e => e.outcome), ['shown', 'resolved']);
    assert.equal(h.events[1].resolved_via, 'send_button');
    assert.equal(h.events[1].time_to_resolve_ms, 2000);
  });
});

describe('setup popup event contract', () => {
  it('every step id rendered in the popup is on the allowlist, and the click hook reads it', () => {
    const base = { mode: 'cloud', state: 'offline', statusIssue: '', hasToken: false, cloudUrl: 'https://x.example', localPort: 9960, registering: false, checking: false, mcpConfig: '{}', mcpConfigDisplay: '{}', localCommand: 'cmd', tools: [{ key: 'claude', label: 'Claude', path: 'p' }], changeCount: 1 } as const;
    const deps = { esc: (v: string) => v, icon: () => '' };
    const seen = new Set<string>();
    for (const m of [base, { ...base, hasToken: true }, { ...base, mode: 'local' }, { ...base, state: 'running', hasToken: true }, { ...base, statusIssue: 'no_content_script' }, { ...base, state: 'connected', hasToken: true }]) {
      for (const [, id] of renderSendSetupDialog(m as any, deps).matchAll(/data-dm-setup-step="([a-z_]+)"/g)) seen.add(id);
    }
    assert.ok(seen.size >= 6);
    for (const id of seen) assert.ok((SETUP_POPUP_STEPS as readonly string[]).includes(id), id);
    assert.match(source, /target\.closest<HTMLElement>\('\[data-dm-send-setup\] \[data-dm-setup-step\]'\)/);
  });

  it('keeps only allowlisted values and rounds durations', () => {
    const e = boundedEvent({ feature: 'setup_popup', outcome: 'resolved', reason: 'cloud_token_missing', mode: 'cloud', step: 'recheck', resolved_via: 'send_button', time_to_resolve_ms: 12_499, time_open_ms: 99_999_999, token: 'dm_secret', url: 'https://x.invalid' });
    assert.deepEqual(e, { feature: 'setup_popup', outcome: 'resolved', reason: 'cloud_token_missing', mode: 'cloud', step: 'recheck', resolved_via: 'send_button', time_to_resolve_ms: 12_000, time_open_ms: 1_800_000 });
    const bad = boundedEvent({ feature: 'setup_popup', outcome: 'step_action', reason: 'dm_secret_token', step: 'paste https://x.invalid', resolved_via: 'x', time_to_resolve_ms: -5, time_open_ms: NaN });
    assert.deepEqual(bad, { feature: 'setup_popup', outcome: 'step_action', time_to_resolve_ms: 0 });
  });

  it('popup reason codes do not widen the reason of other events', () => {
    const e = boundedEvent({ feature: 'dm_style', outcome: 'failure' });
    assert.equal(e, null);
    assert.equal(boundedEvent({ feature: 'style', outcome: 'failure', reason: 'cloud_token_missing' })?.reason, undefined);
  });
});
