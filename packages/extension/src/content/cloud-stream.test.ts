import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { MIN_HEALTHY_STREAM_MS, parseSseFrame, planReconnect } from './cloud-stream.ts';

describe('cloud stream clean close', () => {
  it('parses the relay reconnect frame', () => {
    assert.deepEqual(parseSseFrame('event: reconnect\ndata: {"reason":"max_duration"}'), { event: 'reconnect', data: '{"reason":"max_duration"}' });
    assert.deepEqual(parseSseFrame(': ping 123'), { event: 'message', data: '' });
    assert.deepEqual(parseSseFrame('event: relay\ndata: {"type":"X"}'), { event: 'relay', data: '{"type":"X"}' });
  });

  it('reconnects immediately after a requested reconnect on a healthy stream', () => {
    assert.deepEqual(planReconnect({ reconnectRequested: true, streamOpenMs: 290_000, backoffMs: 8000 }), { delayMs: 0, backoffMs: 1000 });
  });

  it('does not hot-loop if the relay keeps asking to reconnect right away', () => {
    const plan = planReconnect({ reconnectRequested: true, streamOpenMs: MIN_HEALTHY_STREAM_MS - 1, backoffMs: 1000 });
    assert.deepEqual(plan, { delayMs: 1000, backoffMs: 2000 });
  });

  it('keeps the existing backoff (capped) for dropped connections', () => {
    assert.deepEqual(planReconnect({ reconnectRequested: false, streamOpenMs: 290_000, backoffMs: 1000 }), { delayMs: 1000, backoffMs: 2000 });
    assert.deepEqual(planReconnect({ reconnectRequested: false, streamOpenMs: 10, backoffMs: 12000 }), { delayMs: 12000, backoffMs: 15000 });
  });

  it('the stream loop treats reconnect as routine: no warning, no offline flip', () => {
    const source = readFileSync(new URL('./change-tracker.ts', import.meta.url), 'utf8');
    const loop = source.slice(source.indexOf('async function runCloudStream('), source.indexOf('function handleSseFrame('));
    assert.match(loop, /frame\.event === 'reconnect'\) reconnectRequested = true/);
    assert.match(loop, /planReconnect\(/);
    assert.doesNotMatch(loop, /sseAbort\s*=\s*null|setAgentConnected\(false\)|console\.(warn|error)\([^)]*(lost|reconnect)/);
  });
});
