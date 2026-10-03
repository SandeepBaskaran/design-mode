import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasNativeColourPicker, pickColour, screenshotPoint } from './page-colour-picker';

test('maps displayed screenshot pixels independently of page zoom and DPR', () => {
  for (const dpr of [1, 1.25, 2, 3]) {
    for (const zoom of [0.5, 1, 1.5, 2]) {
      const rect = { left: 11, top: 17, width: 400 * zoom, height: 200 * zoom };
      assert.deepEqual(screenshotPoint(11 + rect.width / 4, 17 + rect.height / 2, rect, 800 * dpr, 400 * dpr), { x: 200 * dpr, y: 200 * dpr });
    }
  }
});

test('rejects outside, zero-size and non-finite coordinates', () => {
  const rect = { left: 10, top: 10, width: 100, height: 50 };
  for (const [x, y] of [[9, 10], [110, 10], [10, 60], [NaN, 10], [10, Infinity]]) assert.equal(screenshotPoint(x, y, rect, 200, 100), null);
  assert.equal(screenshotPoint(10, 10, { ...rect, width: 0 }, 200, 100), null);
});

test('native Chrome route opens synchronously and never captures', async () => {
  let opened = false;
  const host = { EyeDropper: class { open() { opened = true; return Promise.resolve({ sRGBHex: '#123456' }); } } };
  assert.equal(hasNativeColourPicker(host), true);
  assert.equal(hasNativeColourPicker({}), false);
  const result = pickColour({ host, document: {} as Document, capture: async () => { throw Error('must not capture'); }, isCurrent: () => true });
  assert.equal(opened, true);
  assert.equal(await result, '#123456');
});

test('native cancellation and stale results never apply', async () => {
  for (const stale of [false, true]) {
    let current = true;
    const host = { EyeDropper: class { async open() { if (stale) { current = false; return { sRGBHex: '#123456' }; } throw new DOMException('Cancelled', 'AbortError'); } } };
    assert.equal(await pickColour({ host, document: {} as Document, capture: async () => { throw Error('must not capture'); }, isCurrent: () => current }), null);
  }
});

function snapshotFixture() {
  const nodes: any[] = [];
  const doc: any = {
    activeElement: null,
    body: { append() {} },
    createElement(tag: string) {
      const node: any = {
        tag, style: {}, attributes: {}, isConnected: true, width: 0, height: 0,
        naturalWidth: 4, naturalHeight: 2,
        setAttribute(key: string, value: string) { this.attributes[key] = value; },
        append() {}, addEventListener() {}, showModal() {},
        focus() { doc.activeElement = this; },
        remove() { this.isConnected = false; },
        getContext() { return { drawImage() {}, getImageData() { return { data: new Uint8ClampedArray([18, 52, 86, 255]) }; } }; },
        set src(value: string) { if (value) queueMicrotask(() => this.onload?.()); },
      };
      nodes.push(node);
      return node;
    },
  };
  const previous = doc.createElement('button'); previous.focus();
  return { doc, previous, node: (tag: string) => nodes.find(n => n.tag === tag) };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

test('snapshot keyboard cursor and live colour feedback do not alter sampled pixels', async () => {
  const { doc, previous, node } = snapshotFixture();
  const pending = pickColour({ host: {}, document: doc, isCurrent: () => true, capture: async () => ({ dataUrl: 'data:image/png;base64,AAAA' }) });
  await flush();
  const canvas = node('canvas');
  assert.equal(doc.activeElement, canvas);
  assert.equal(canvas.attributes.role, 'application');
  assert.equal(node('span').hidden, false);
  assert.equal(node('span').style.left, '12.5%');
  canvas.onkeydown({ key: 'ArrowRight', preventDefault() {} });
  assert.equal(node('span').style.left, '37.5%');
  assert.equal(node('span').style.top, '25%');
  canvas.onkeydown({ key: 'Enter', preventDefault() {} });
  assert.equal(await pending, '#123456');
  assert.equal(canvas.width, 0);
  assert.equal(node('dialog').isConnected, false);
  assert.equal(doc.activeElement, previous);
});

test('snapshot propagates returned permission/bridge errors and restores focus', async () => {
  for (const error of ['Website access denied', 'Inspector response too large. Try a smaller selection or viewport.']) {
    const { doc, previous, node } = snapshotFixture();
    await assert.rejects(pickColour({ host: {}, document: doc, isCurrent: () => true, capture: async () => ({ error }) }), { message: error });
    assert.equal(node('dialog').isConnected, false);
    assert.equal(doc.activeElement, previous);
    assert.equal(node('img'), undefined);
  }
});

test('snapshot late rejection after target change cancels without restoring old focus', async () => {
  const { doc, previous, node } = snapshotFixture();
  let current = true;
  let reject!: (error: Error) => void;
  const pending = pickColour({ host: {}, document: doc, isCurrent: () => current, capture: () => new Promise((_resolve, fail) => { reject = fail; }) });
  await flush();
  current = false;
  reject(new Error('Old target capture failed'));
  assert.equal(await pending, null);
  assert.equal(node('dialog').isConnected, false);
  assert.notEqual(doc.activeElement, previous);
});

test('native unexpected errors are reported rather than silently falling back', async () => {
  const host = { EyeDropper: class { async open(): Promise<{ sRGBHex: string }> { throw new Error('Native picker failed'); } } };
  await assert.rejects(pickColour({ host, document: {} as Document, capture: async () => { throw Error('must not capture'); }, isCurrent: () => true }), /Native picker failed/);
});
