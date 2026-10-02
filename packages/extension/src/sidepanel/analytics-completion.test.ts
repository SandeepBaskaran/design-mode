import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('./sidepanel.ts', import.meta.url), 'utf8');
const functionSource = source.slice(source.indexOf('async function takeScreenshot()'), source.indexOf('let commentSubmitting'));
for (const mode of ['clipboard', 'download', 'both']) {
  for (const fail of [false, true]) test(`screenshot ${mode}: actual completion boundary, failure=${fail}`, async () => {
    const events: any[] = [];
    const context: any = {
      info: null, captureMode: mode, trackFeature: (event: unknown) => events.push(event),
      send: async () => ({ dataUrl: 'data:image/png;base64,eA==' }),
      fetch: async () => ({ blob: async () => new Blob(['x']) }),
      navigator: { clipboard: { write: async () => { if (fail) throw Error('denied'); } } },
      ClipboardItem: class {}, root: { querySelector: () => null },
      document: { createElement: () => ({ click() { if (fail) throw Error('blocked'); } }) },
      showCaptureToast() {}, console: { warn() {} },
    };
    runInNewContext(transformSync(functionSource + '\nglobalThis.run = takeScreenshot;', { loader: 'ts' }).code, context);
    await context.run();
    assert.deepEqual(events.map(e => e.outcome), [
      ...(mode !== 'download' ? [fail ? 'clipboard_failed' : 'clipboard_completed'] : []),
      ...(mode !== 'clipboard' ? [fail ? 'download_failed' : 'download_initiated'] : []),
    ]);
    assert.ok(events.every(e => e.feature === 'screenshot'));
  });
}
