import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import config from '../../vite.config';

const output = (config as any).build.rollupOptions.output;
const script = `(function () { ${output.intro} starts++; if (fail) throw Error('startup'); ${output.outro} })()`;

test('live duplicate skips every module side effect; invalidated runtime can initialize again', () => {
  const runtime = { id: 'installed' as string | undefined };
  const context = vm.createContext({ browser: { runtime }, starts: 0, fail: false });
  vm.runInContext(script, context);
  vm.runInContext(script, context);
  assert.equal(context.starts, 1);
  runtime.id = undefined;
  context.browser.runtime = { id: 'reloaded' };
  vm.runInContext(script, context);
  vm.runInContext(script, context);
  assert.equal(context.starts, 2);
});

test('throwing stale runtime and failed startup do not permanently lock initialization', () => {
  const context = vm.createContext({ browser: { runtime: { id: 'installed' } }, starts: 0, fail: true, __dmContentRuntime: () => { throw Error('invalidated'); } });
  assert.throws(() => vm.runInContext(script, context), /startup/);
  context.fail = false;
  vm.runInContext(script, context);
  vm.runInContext(script, context);
  assert.equal(context.starts, 2);
});
