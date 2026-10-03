import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSync } from 'esbuild';
import { runInNewContext } from 'node:vm';

function render(configured: boolean) {
  const bundle = buildSync({ entryPoints: [new URL('./analytics-setting.ts', import.meta.url).pathname], bundle: true, write: false, format: 'cjs', platform: 'browser', define: {
    __DM_ANALYTICS__: JSON.stringify(configured ? { host: 'https://analytics.invalid', key: 'phc_local_test_only' } : null),
  } }).outputFiles[0].text;
  const context = { module: { exports: {} as { renderAnalyticsSetting: () => string } }, console };
  runInNewContext(bundle, context);
  return context.module.exports.renderAnalyticsSetting();
}

test('configured builds disclose analytics as on, without an opt-in switch', () => {
  const html = render(true);
  assert.match(html, /Usage analytics is on/);
  assert.match(html, /Chrome, Firefox or Safari/);
  assert.equal(html.includes('toggle-analytics'), false);
  assert.equal(html.includes('I agree'), false);
});

test('unconfigured builds send nothing and say so', () => {
  assert.match(render(false), /Nothing is sent/);
});
