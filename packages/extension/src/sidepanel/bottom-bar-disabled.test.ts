import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('./sidepanel.ts', import.meta.url), 'utf8');
const start = source.indexOf('function renderStickyBottom(): string {');
const end = source.indexOf('\n}\n', start) + 2;
const compiled = transformSync(source.slice(start, end) + '\nglobalThis.render = renderStickyBottom;', { loader: 'ts' }).code;
for (const [name, hasChanges, preview, disabled] of [
  ['empty', false, false, true],
  ['changes', true, false, false],
  ['preview original', true, true, true],
] as const) test(`Copy as Prompt exposes native disabled state: ${name}`, () => {
  const context: any = {
    siteChangeCount: () => hasChanges ? 1 : 0,
    styleChanges: hasChanges ? [{}] : [], textChanges: [], domChanges: [], comments: [],
    previewingOriginal: preview, mcpMode: 'cloud', feedbackSession: null,
    sendingFeedback: false, feedbackSentUntil: 0, mcpState: 'offline', renderLiveFeedbackStatus: () => '',
    escapeAttr: (text: string) => text, icon: () => '',
  };
  runInNewContext(compiled, context);
  const button = context.render().match(/<button id="dm-copy-prompt-btn"[^>]+>/)?.[0];
  assert.ok(button);
  assert.equal(button.includes(' disabled aria-disabled="true"'), disabled);
});

test('Send confirmation survives rerenders until its deadline', () => {
  let now = 1000;
  const context: any = {
    siteChangeCount: () => 1,
    styleChanges: [{}], textChanges: [], domChanges: [], comments: [],
    previewingOriginal: false, mcpMode: 'local', feedbackSession: null,
    sendingFeedback: false, feedbackSentUntil: 2500, mcpState: 'connected',
    renderLiveFeedbackStatus: () => '', escapeAttr: (text: string) => text,
    icon: () => '', Date: { now: () => now },
  };
  runInNewContext(compiled, context);
  assert.match(context.render(), / Sent!<\/button>/);
  now = 2499;
  assert.match(context.render(), / Sent!<\/button>/);
  now = 2500;
  assert.doesNotMatch(context.render(), / Sent!<\/button>/);
  assert.match(context.render(), /Send to your AI agent/);
});
