import test from 'node:test';
import assert from 'node:assert/strict';
import { replaceUserStyles } from '../background/user-styles';
import { syncUserStyles, setUserOverridesEnabled, userOverrideScope, whenUserStylesPainted } from './user-styles';

const sender = { id: 'extension', tab: { id: 7 }, frameId: 2 } as chrome.runtime.MessageSender;

test('user-origin bridge is sender/frame scoped and independent of worker memory', async () => {
  const calls: any[] = [];
  (globalThis as any).browser = {
    runtime: { id: 'extension', sendMessage: async (msg: any) => { calls.push(['notify', msg]); } },
    scripting: {
      removeCSS: async (details: any) => { calls.push(['remove', details]); },
      insertCSS: async (details: any) => { calls.push(['insert', details]); },
    },
  };
  assert.equal((await replaceUserStyles({ css: 'new', previousCss: 'old' }, { ...sender, id: 'foreign' })).ok, false);
  assert.equal((await replaceUserStyles({ css: 'new', previousCss: 'old' }, { id: 'extension' })).ok, false);
  assert.equal(calls.length, 0);
  assert.equal((await replaceUserStyles({ css: 'new', previousCss: 'old' }, sender)).ok, true);
  assert.deepEqual(calls, [
    ['remove', { target: { tabId: 7, frameIds: [2] }, css: 'old', origin: 'USER' }],
    ['insert', { target: { tabId: 7, frameIds: [2] }, css: 'new', origin: 'USER' }],
  ]);
  calls.length = 0;
  (globalThis as any).browser.scripting.insertCSS = async (details: any) => {
    calls.push(['insert', details]);
    if (details.css === 'bad') throw Error('injection denied');
  };
  assert.equal((await replaceUserStyles({ css: 'bad', previousCss: 'old' }, sender)).ok, false);
  assert.equal(calls[2][1].css, 'old');
  assert.equal(calls[3][1].type, 'STYLE_OVERRIDE_ERROR');
  assert.equal(calls[3][1]._dmTab, 7);
});

test('document queue serializes updates, coalesces pending edits and gates preview immediately', async () => {
  const attrs = new Map<string, string>(), calls: any[] = [];
  const resolves: Array<(v: unknown) => void> = [];
  (globalThis as any).document = { documentElement: {
    setAttribute: (key: string, value: string) => attrs.set(key, value),
    removeAttribute: (key: string) => attrs.delete(key),
  } };
  (globalThis as any).window = { dispatchEvent: () => {} };
  (globalThis as any).browser = { runtime: { sendMessage: (msg: any) => {
    calls.push(msg); return new Promise(resolve => resolves.push(resolve));
  } } };
  syncUserStyles('first');
  await Promise.resolve();
  syncUserStyles('second');syncUserStyles('last');
  let painted = false;
  const paint = whenUserStylesPainted().then(() => { painted = true; });
  assert.equal(calls.length, 1);
  assert.equal(painted, false);
  setUserOverridesEnabled(false);
  assert.equal(attrs.size, 0);
  resolves.shift()!({ ok: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 2);
  assert.equal(calls[1].css, 'last');
  assert.equal(calls[1].previousCss, 'first');
  assert.equal(painted, false);
  assert.equal(attrs.size, 0);
  resolves.shift()!({ ok: true });
  await new Promise(resolve => setImmediate(resolve));
  await paint;
  assert.equal(painted, true);
  assert.equal(calls.length, 2);
  setUserOverridesEnabled(true);
  assert.ok(userOverrideScope().includes(attrs.get('data-dm-override-session')!));
  syncUserStyles('');
  await Promise.resolve();
  assert.equal(calls.at(-1).previousCss, 'last');
  resolves.shift()!({ ok: true });
  await new Promise(resolve => setImmediate(resolve));
});
