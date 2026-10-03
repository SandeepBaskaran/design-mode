import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { writeScreenshotClipboard } from './screenshot-clipboard';

function clipboardFixture(t: TestContext, write: (items: any[]) => Promise<void>) {
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

test('starts the clipboard write synchronously and supplies the captured PNG later', async t => {
  let finish!: (value: { dataUrl: string }) => void;
  const capture = new Promise<{ dataUrl: string }>(resolve => { finish = resolve; });
  let started = false;
  clipboardFixture(t, async items => {
    started = true;
    const blob = await items[0].data['image/png'];
    assert.equal(blob.type, 'image/png');
  });
  const result = writeScreenshotClipboard(capture);
  assert.equal(started, true);
  finish({ dataUrl: 'data:image/png;base64,' });
  assert.equal(await result, true);
});

test('reports rejected clipboard permissions without an unhandled rejection', async t => {
  clipboardFixture(t, async () => { throw new Error('NotAllowedError'); });
  assert.equal(await writeScreenshotClipboard(Promise.resolve({})), false);
});

test('does not fetch arbitrary URLs returned instead of capture data', async t => {
  clipboardFixture(t, async items => { await items[0].data['image/png']; });
  assert.equal(await writeScreenshotClipboard(Promise.resolve({ dataUrl: 'https://example.com/not-a-capture' })), false);
});

test('reports capture rejection', async t => {
  clipboardFixture(t, async items => { await items[0].data['image/png']; });
  assert.equal(await writeScreenshotClipboard(Promise.reject(new Error('Target changed'))), false);
});
