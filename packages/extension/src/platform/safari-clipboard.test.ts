import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { writeInspectorTextClipboard } from '../inspector/clipboard';

function fixture(t: TestContext, write: (items: any[]) => Promise<void>) {
  for (const [key, value] of Object.entries({
    navigator: { clipboard: { write } },
    ClipboardItem: class { constructor(public data: Record<string, Promise<Blob>>) {} },
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
}

test('Safari text export reserves clipboard synchronously before RPC resolves', async t => {
  let finish!: (value: string) => void;
  const text = new Promise<string>(resolve => { finish = resolve; });
  let started = false;
  fixture(t, async items => {
    started = true;
    const blob = await items[0].data['text/plain'];
    assert.equal(blob.type, 'text/plain');
    assert.equal(await blob.text(), 'body { color: red; }');
  });
  const result = writeInspectorTextClipboard(text);
  assert.equal(started, true);
  finish('body { color: red; }');
  assert.equal(await result, true);
});

test('Safari text copy refuses empty or stale exports', async t => {
  fixture(t, async items => { await items[0].data['text/plain']; });
  assert.equal(await writeInspectorTextClipboard(Promise.resolve('')), false);
  assert.equal(await writeInspectorTextClipboard(Promise.reject(new Error('Target changed'))), false);
});

test('Safari early clipboard denial consumes a later export rejection', async t => {
  let reject!: (error: Error) => void;
  const output = new Promise<string>((_resolve, fail) => { reject = fail; });
  fixture(t, async () => { throw new DOMException('Gesture denied', 'NotAllowedError'); });
  assert.equal(await writeInspectorTextClipboard(output), false);
  reject(new Error('Inspector response too large'));
  await new Promise(resolve => setImmediate(resolve));
});

test('Safari missing clipboard consumes a later export rejection', async t => {
  let reject!: (error: Error) => void;
  const output = new Promise<string>((_resolve, fail) => { reject = fail; });
  fixture(t, async () => {});
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  assert.equal(await writeInspectorTextClipboard(output), false);
  reject(new Error('Inspector target changed'));
  await new Promise(resolve => setImmediate(resolve));
});

test('Safari text copy reports denied gestures and synchronous API failure', async t => {
  fixture(t, async () => { throw new Error('NotAllowedError'); });
  assert.equal(await writeInspectorTextClipboard(Promise.reject(new Error('Export failed'))), false);
  Object.defineProperty(globalThis, 'ClipboardItem', { configurable: true, value: undefined });
  assert.equal(await writeInspectorTextClipboard(Promise.resolve('example')), false);
});
