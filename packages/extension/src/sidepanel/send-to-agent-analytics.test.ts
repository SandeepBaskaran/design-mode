import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
});
