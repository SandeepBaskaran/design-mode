import test from 'node:test';
import assert from 'node:assert/strict';
import { withTemporaryUserStyles, whenUserStylesPainted } from './user-styles';

test('temporary USER styles await insertion and cleanup, including callback failure', async () => {
  const calls: any[] = [];
  const resolves: Array<(value: unknown) => void> = [];
  (globalThis as any).browser = { runtime: { sendMessage: (message: any) => {
    calls.push(message);
    return new Promise(resolve => resolves.push(resolve));
  } } };
  let ran = false, settled = false;
  const operation = withTemporaryUserStyles('temporary', () => { ran = true; throw Error('timeline failure'); });
  const rejected = assert.rejects(operation, /timeline failure/).then(() => { settled = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ran, false);
  assert.deepEqual(calls[0], {type:'DM_REPLACE_USER_STYLES',css:'temporary',previousCss:''});
  resolves.shift()!({ok:true});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ran, true);
  assert.equal(settled, false);
  assert.deepEqual(calls[1], {type:'DM_REPLACE_USER_STYLES',css:'',previousCss:'temporary'});
  resolves.shift()!({ok:true});
  await rejected;
  await whenUserStylesPainted();
});

test('temporary USER styles serialize previews and propagate insertion/cleanup failures', async () => {
  const calls: string[] = [];
  (globalThis as any).browser = { runtime: { sendMessage: async (message: any) => {
    calls.push(message.css || `remove:${message.previousCss}`);
    return {ok:message.css !== 'denied' && message.previousCss !== 'cleanup-denied',error:'bridge denied'};
  } } };
  await Promise.all([
    withTemporaryUserStyles('first', () => calls.push('run:first')),
    withTemporaryUserStyles('second', () => calls.push('run:second')),
  ]);
  assert.deepEqual(calls, ['first','run:first','remove:first','second','run:second','remove:second']);
  await assert.rejects(withTemporaryUserStyles('denied', () => assert.fail('must not run')), /bridge denied/);
  await assert.rejects(withTemporaryUserStyles('cleanup-denied', () => {}), /bridge denied/);
  await withTemporaryUserStyles('recovered', () => {});
});
