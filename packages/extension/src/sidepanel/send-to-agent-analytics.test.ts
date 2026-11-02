import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { changeCountBucket, commandOutcome, messageFeatures, pageSchemeFromUrl, styleAnalytics, styleAnalyticsList, thrownFailure } from '../platform/analytics.ts';

const source = readFileSync(new URL('./sidepanel.ts', import.meta.url), 'utf8');
const start = source.indexOf('async function sendToAgent(');
const body = source.slice(start, source.indexOf('async function stopLiveFeedback('));

describe('Send to Agent analytics wiring', () => {
  it('derives the pre-flight failure code from the setup state, not a fixed guess', () => {
    assert.match(body, /sendToAgentBlock\(mcpState, mcpMode, !!mcpCloudToken, mcpStatusIssue\)/);
    assert.doesNotMatch(body, /bridge_unreachable|agent_timeout/);
  });

  it('reports the busy and refused paths instead of returning silently', () => {
    assert.match(body, /reason: 'busy', error_code: 'agent_busy'/);
  });

  it('records why the status probe failed and tags send events with mode', () => {
    assert.match(source, /mcpStatusIssue = res\?\.error \? classifyErrorCode\(res\) : ''/);
    assert.match(source, /msg\?\.type === 'SP_SEND_TO_AGENT' \? \{ mode: mcpMode/);
  });

  it('send() puts mode, change count, page scheme and trigger on the acknowledgement (no attempt event), and keeps the label off the wire', async () => {
    const sendSource = source.slice(source.indexOf('async function send('), source.indexOf('// file:// URLs have an empty hostname'));
    const events: any[] = [];
    const wire: any[] = [];
    const context: any = {
      messageFeatures, styleAnalytics, styleAnalyticsList, commandOutcome, thrownFailure, changeCountBucket, pageSchemeFromUrl,
      Object, mcpMode: 'cloud', siteChangeCount: () => 3, boundPageUrl: 'https://example.com/', myTabId: 7, IS_SAFARI: false,
      beginInspectorOperation: () => ({ assertCurrent() {}, wait: (p: Promise<any>) => p, isCurrent: () => true }),
      trackFeature: (e: unknown) => events.push(e), resolveTokenScopeKind: () => 'root',
      browser: { runtime: { sendMessage: async (m: unknown) => { wire.push(m); return { ok: true }; } } },
    };
    runInNewContext(transformSync(sendSource + '\nglobalThis.send = send;', { loader: 'ts' }).code, context);
    await context.send({ type: 'SP_SEND_TO_AGENT', scope: 'site', analyticsTrigger: 'setup_popup' });
    assert.deepEqual(events.map(e => [e.feature, e.outcome]), [['send_to_agent', 'command_acknowledged']]);
    for (const e of events) assert.deepEqual([e.mode, e.change_count_bucket, e.page_scheme, e.trigger], ['cloud', '2-5', 'https', 'setup_popup']);
    assert.equal(JSON.stringify(wire), JSON.stringify([{ type: 'SP_SEND_TO_AGENT', scope: 'site', targetTabId: 7 }]));
  });
});
