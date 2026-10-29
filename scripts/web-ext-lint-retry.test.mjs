import assert from 'node:assert/strict';
import { test } from 'node:test';

import { lintWithRetry } from './web-ext-lint-retry.mjs';

const sequence = (...results) => {
  let calls = 0;
  const lint = () => results[Math.min(calls++, results.length - 1)];
  return { lint, calls: () => calls };
};
const quiet = { warn: () => {} };

test('a SIGBUS death is retried until web-ext produces a result', () => {
  const s = sequence({ signal: 'SIGBUS', status: null }, { signal: 'SIGBUS', status: null }, { signal: null, status: 0 });
  assert.equal(lintWithRetry(s.lint, quiet).status, 0);
  assert.equal(s.calls(), 3);
});

test('a real lint failure fails on the first attempt without retrying', () => {
  const s = sequence({ signal: null, status: 1, stdout: 'errors 2' }, { signal: null, status: 0 });
  assert.throws(() => lintWithRetry(s.lint, quiet), /web-ext lint failed \(exit 1\)/);
  assert.equal(s.calls(), 1);
});

test('a lint failure after a SIGBUS retry still fails', () => {
  const s = sequence({ signal: 'SIGBUS', status: null }, { signal: null, status: 1 });
  assert.throws(() => lintWithRetry(s.lint, quiet), /web-ext lint failed/);
  assert.equal(s.calls(), 2);
});

for (const signal of ['SIGSEGV', 'SIGKILL', 'SIGINT', 'SIGTERM']) {
  test(`${signal} is not retried`, () => {
    const s = sequence({ signal, status: null }, { signal: null, status: 0 });
    assert.throws(() => lintWithRetry(s.lint, quiet), new RegExp(`signal ${signal}; only SIGBUS is retried`));
    assert.equal(s.calls(), 1);
  });
}

test('SIGBUS on every attempt fails after the attempt limit', () => {
  const s = sequence({ signal: 'SIGBUS', status: null });
  assert.throws(() => lintWithRetry(s.lint, { ...quiet, attempts: 8 }), /crashed 8 times/);
  assert.equal(s.calls(), 8);
});

test('a spawn error is rethrown immediately', () => {
  const s = sequence({ error: new Error('ENOENT') });
  assert.throws(() => lintWithRetry(s.lint, quiet), /ENOENT/);
  assert.equal(s.calls(), 1);
});
