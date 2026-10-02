import test from 'node:test';
import assert from 'node:assert/strict';
import { setUserStylePreview, syncUserStyles, whenUserStylesPainted } from './user-styles';

test('resize preview survives tracked updates but clears without removing committed styles', async () => {
  const calls: any[] = [];
  (globalThis as any).document = { documentElement: { setAttribute() {}, removeAttribute() {} } };
  (globalThis as any).window = { dispatchEvent() {} };
  (globalThis as any).browser = { runtime: { sendMessage: async (message: any) => { calls.push(message); return { ok: true }; } } };
  syncUserStyles('original');
  await whenUserStylesPainted();
  setUserStylePreview('preview');
  await whenUserStylesPainted();
  assert.equal(calls.at(-1).css, 'originalpreview');
  syncUserStyles('committed');
  await whenUserStylesPainted();
  assert.equal(calls.at(-1).css, 'committedpreview');
  setUserStylePreview('');
  await whenUserStylesPainted();
  assert.equal(calls.at(-1).css, 'committed');
  assert.equal(calls.at(-1).previousCss, 'committedpreview');
});
