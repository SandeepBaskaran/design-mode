import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  exportCodeFilename,
  exportMimeType,
  serializeChangesJson,
  summarizeExportPayload,
  formatExportCount,
} from './export-actions';

describe('export code filenames', () => {
  it('stamps design-mode-changes files with the requested extension', () => {
    const d = new Date('2026-10-27T05:20:33.400Z');
    assert.equal(exportCodeFilename('json', d), 'design-mode-changes-2026-10-27T05-20-33.json');
    assert.equal(exportCodeFilename('css', d), 'design-mode-changes-2026-10-27T05-20-33.css');
  });

  it('falls back to the current time', () => {
    assert.match(exportCodeFilename('css'), /^design-mode-changes-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.css$/);
  });
});

describe('export mime types', () => {
  it('maps each format to a correct content type', () => {
    assert.equal(exportMimeType('json'), 'application/json');
    assert.equal(exportMimeType('css'), 'text/css');
  });
});

describe('serializeChangesJson', () => {
  it('pretty-prints with two spaces and round-trips page-derived special characters', () => {
    const payload = {
      selector: '<img onerror=x>',
      note: 'line1\nline2 "quoted" & …',
    };
    const text = serializeChangesJson(payload);
    assert.equal(text, JSON.stringify(payload, null, 2));
    assert.deepEqual(JSON.parse(text), payload);
  });

  it('serializes an empty payload without throwing', () => {
    assert.equal(serializeChangesJson({}), '{}');
  });
});

describe('summarizeExportPayload', () => {
  it('counts entries across route groups and ignores the duplicated flat active-route arrays', () => {
    const payload = {
      styleChanges: [{ selector: 'h1' }],
      textChanges: [],
      domChanges: [{ action: 'move' }],
      comments: [{ text: 'note' }],
      routeGroups: [
        { styleChanges: [{}, {}], textChanges: [{}], domChanges: [], comments: [] },
        { styleChanges: [], textChanges: [], domChanges: [], comments: [{}, {}] },
      ],
    };
    assert.deepEqual(
      summarizeExportPayload(payload),
      { style: 2, text: 1, dom: 0, comment: 2, total: 5 },
    );
  });

  it('falls back to flat arrays when routeGroups are absent', () => {
    const payload = {
      styleChanges: [{}, {}],
      textChanges: [{}],
      domChanges: [],
      comments: [],
    };
    assert.deepEqual(
      summarizeExportPayload(payload),
      { style: 2, text: 1, dom: 0, comment: 0, total: 3 },
    );
  });

  it('returns zeros for empty or malformed payloads', () => {
    const zeros = { style: 0, text: 0, dom: 0, comment: 0, total: 0 };
    assert.deepEqual(summarizeExportPayload({}), zeros);
    assert.deepEqual(summarizeExportPayload(null), zeros);
    assert.deepEqual(summarizeExportPayload({ routeGroups: 'nope' }), zeros);
  });
});

describe('formatExportCount', () => {
  it('pluralises the total', () => {
    assert.equal(formatExportCount({ style: 0, text: 0, dom: 0, comment: 0, total: 1 }), '1 change');
    assert.equal(formatExportCount({ style: 0, text: 0, dom: 0, comment: 0, total: 3 }), '3 changes');
  });
});
