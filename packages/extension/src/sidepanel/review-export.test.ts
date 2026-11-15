import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reviewFile, shotsFromCapture } from './review-export.ts';

const payload = { version: 2, kind: 'design-mode-changes', comments: [] };
const now = new Date('2026-11-15T12:00:00.000Z');

test('an export with no region stays a JSON file', () => {
  const file = reviewFile(payload, [], now);
  assert.equal(file.name, 'design-mode-changes-2026-11-15T12-00-00.json');
  assert.equal(file.mime, 'application/json');
  assert.equal(JSON.parse(new TextDecoder().decode(file.bytes)).kind, 'design-mode-changes');
});

test('a region export is a zip naming the png inside it', () => {
  const png = Uint8Array.from([137, 80, 78, 71]);
  const shots = shotsFromCapture(['box'], [{ id: 'box', dataUrl: 'data:image/png;base64,' + Buffer.from(png).toString('base64') }]);
  const file = reviewFile(payload, shots, now);
  assert.equal(file.name, 'design-mode-changes-2026-11-15T12-00-00.zip');
  assert.equal(file.mime, 'application/zip');
  const text = Buffer.from(file.bytes).toString('latin1');
  assert.ok(text.includes('design-mode-changes.json'));
  assert.ok(text.includes('regions/region-1.png'));
  const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  assert.deepEqual(parsed.regionScreenshots, [{ commentId: 'box', file: 'regions/region-1.png', status: 'saved' }]);
});

test('a region that could not be captured is named as missing and still zipped', () => {
  const file = reviewFile(payload, shotsFromCapture(['box'], []), now);
  const text = Buffer.from(file.bytes).toString('latin1');
  assert.equal(file.mime, 'application/zip');
  assert.ok(text.includes('"status": "not-captured"'));
  assert.ok(!text.includes('regions/region-1.png'));
});
