import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { changeCountBucket, pageSchemeFromUrl, sendToAgentBlock } from '../platform/analytics.ts';

const source = readFileSync(new URL('./sidepanel.ts', import.meta.url), 'utf8');
const fn = source.slice(source.indexOf('async function sendToAgent('), source.indexOf('async function stopLiveFeedback('));

interface Setup { mcpState: string; mcpMode: string; mcpCloudToken: string; mcpStatusIssue?: string; mcpStatusError?: string; implementing?: boolean }

async function click(setup: Setup, trigger?: 'setup_popup') {
  const events: any[] = [];
  const sent: any[] = [];
  let dialogOpened = 0;
  const context: any = {
    ...setup,
    mcpStatusIssue: setup.mcpStatusIssue || '',
    mcpStatusError: setup.mcpStatusError || '',
    sendingFeedback: false, previewingOriginal: false, boundPageUrl: 'https://example.com/',
    feedbackSession: setup.implementing ? { state: 'implementing' } : null, feedbackSentUntil: 0,
    beginInspectorOperation: () => ({ assertCurrent() {}, wait: (p: Promise<any>) => p, isCurrent: () => true }),
    refreshMcpStatus: async () => {},
    sendToAgentBlock, changeCountBucket, pageSchemeFromUrl, siteChangeCount: () => 3,
    trackFeature: (e: unknown) => events.push(e),
    openSendSetup: () => { dialogOpened++; },
    send: async (m: any) => { sent.push(m); return { ok: true, supported: true, session: null }; },
    parseFeedbackSession: () => null, showCaptureToast() {}, render() {}, setTimeout() {}, Date,
  };
  runInNewContext(transformSync(fn + '\nglobalThis.run = sendToAgent;', { loader: 'ts' }).code, context);
  await context.run(undefined, trigger);
  return { events, sent, dialogOpened };
}

describe('Send to Agent setup gate', () => {
  const blockers: Array<[string, Setup, string]> = [
    ['cloud_token_missing', { mcpState: 'offline', mcpMode: 'cloud', mcpCloudToken: '' }, 'cloud_token_missing'],
    ['transport_inactive', { mcpState: 'offline', mcpMode: 'cloud', mcpCloudToken: 'dm_x' }, 'transport_inactive'],
    ['local_server_offline', { mcpState: 'offline', mcpMode: 'local', mcpCloudToken: '' }, 'local_server_offline'],
    ['no_agent_connected', { mcpState: 'running', mcpMode: 'cloud', mcpCloudToken: 'dm_x' }, 'no_agent_connected'],
    ['restricted_url', { mcpState: 'offline', mcpMode: 'cloud', mcpCloudToken: 'dm_x', mcpStatusIssue: 'restricted_url' }, 'restricted_url'],
  ];
  for (const [name, setup, code] of blockers) {
    it(`${name}: sends nothing, emits only dm_send_to_agent_blocked, opens the dialog`, async () => {
      const { events, sent, dialogOpened } = await click(setup);
      assert.deepEqual(sent, []);
      assert.equal(dialogOpened, 1);
      assert.equal(events.length, 1);
      assert.equal(events[0].feature, 'send_to_agent_blocked');
      assert.equal(events[0].error_code, code);
      assert.equal(events[0].mode, setup.mcpMode);
      assert.equal(events[0].change_count_bucket, '2-5');
      assert.ok(!events.some(e => e.feature === 'send_to_agent'));
    });
  }

  it('connected: performs the real send and emits no blocked event', async () => {
    const { events, sent, dialogOpened } = await click({ mcpState: 'connected', mcpMode: 'cloud', mcpCloudToken: 'dm_x' });
    assert.deepEqual(sent.map(m => m.type), ['SP_SEND_TO_AGENT']);
    assert.equal(dialogOpened, 0);
    assert.ok(!events.some(e => e.feature === 'send_to_agent_blocked'));
  });

  it('labels where the click came from: toolbar by default, setup_popup from the popup button', async () => {
    const toolbar = await click({ mcpState: 'connected', mcpMode: 'cloud', mcpCloudToken: 'dm_x' });
    assert.equal(toolbar.sent[0].analyticsTrigger, 'toolbar');
    const popup = await click({ mcpState: 'connected', mcpMode: 'cloud', mcpCloudToken: 'dm_x' }, 'setup_popup');
    assert.equal(popup.sent[0].analyticsTrigger, 'setup_popup');
    const blocked = await click({ mcpState: 'offline', mcpMode: 'local', mcpCloudToken: '' });
    assert.equal(blocked.events[0].trigger, 'toolbar');
  });

  it('an agent that is still implementing is reported as blocked, not as a send', async () => {
    const { events, sent } = await click({ mcpState: 'connected', mcpMode: 'local', mcpCloudToken: '', implementing: true });
    assert.deepEqual(sent, []);
    assert.deepEqual(events.map(e => [e.feature, e.error_code]), [['send_to_agent_blocked', 'agent_busy']]);
  });

  it('keeps the dialog self-contained: no navigation to the MCP page, Esc and focus return wired', () => {
    assert.doesNotMatch(source, /send-agent-help-mcp/);
    const open = source.slice(source.indexOf('function openSendSetup('), source.indexOf('function closeSendSetup('));
    assert.doesNotMatch(open, /mcpOpen\s*=\s*true/);
    assert.match(source, /if \(sendSetupOpen\) \{\s*if \(e\.key === 'Escape'\)/);
    assert.match(source, /sendSetupTrigger && sendSetupTrigger\.isConnected/);
    assert.match(source, /back\?\.focus\(\)/);
  });

  it('keeps focus inside the dialog after a step change removes the focused button', () => {
    const renderFn = source.slice(source.indexOf('function render() {'), source.indexOf('function render() {') + 30000);
    assert.match(renderFn, /if \(sendSetupOpen\) keepSendSetupFocus\(\);/);
    assert.match(source, /function keepSendSetupFocus\(\) \{[\s\S]*dialog\.contains\(document\.activeElement\)/);
  });

  it('stops polling when the dialog closes', () => {
    const close = source.slice(source.indexOf('function closeSendSetup('), source.indexOf('/* ── Phase 2: Layers Tab ── */'));
    assert.match(close, /stopSendSetupPoll\(\)/);
  });
});
