import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('./sidepanel.ts', import.meta.url), 'utf8');
const extract = (signature: string) => {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, signature);
  return source.slice(start, source.indexOf('\n}\n', start) + 2);
};
const compiled = transformSync(
  extract('function mcpStatusDisplay()') + extract('function renderStickyBottom(): string {') +
  '\nglobalThis.status = mcpStatusDisplay; globalThis.bottom = renderStickyBottom;',
  { loader: 'ts' },
).code;

function panel(mcpState: string) {
  const context: any = {
    mcpState, mcpMode: 'cloud', mcpCloudToken: 'token',
    siteChangeCount: () => 1, styleChanges: [{}], textChanges: [], domChanges: [], comments: [],
    previewingOriginal: false, feedbackSession: null, sendingFeedback: false, feedbackSentUntil: 0,
    renderLiveFeedbackStatus: () => '', escapeAttr: (text: string) => text, icon: () => '',
  };
  runInNewContext(compiled, context);
  return context;
}

test('a superseded cloud tab shows Standby, not Connected', () => {
  const status = panel('standby').status();
  assert.equal(status.label, 'Standby');
  assert.match(status.detail, /Another DIVE tab owns this cloud connection/);
  assert.equal(panel('connected').status().label, 'Connected');
});

test('Send to Agent in Standby explains how to take over instead of claiming a connection', () => {
  const button = panel('standby').bottom().match(/<button[^>]*data-dm-action="send-to-agent"[^>]*>/)?.[0];
  assert.ok(button);
  assert.match(button, /reload this tab to take over/);
});
