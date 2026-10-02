import { it } from 'node:test';
import assert from 'node:assert/strict';
import { generateSelector } from './helpers';
import { restoreSavedDomLocations } from './saved-session';
import { validateImportPayload } from './import-validation';
import type { DomChange } from './change-tracker';

it('body is a replayable selector rather than the empty ancestor path', () => {
  const body = { id: '' } as HTMLElement;
  Object.assign(globalThis, { document: { body } });
  assert.equal(generateSelector(body), 'body');
});

it('repairs legacy internal body locations without relaxing file imports', () => {
  Object.assign(globalThis, { document: { createDocumentFragment: () => ({ querySelector: (s: string) => {
    if (!s) throw Error('Invalid selector');
    return null;
  } }) } });
  const change: DomChange = { id: 'delete-1', elementId: 'dm-5', selector: '#delete', action: 'delete',
    tagName: 'div', timestamp: 1, origin: { parentSelector: '', index: 3 } };
  const payload = { styleChanges: [], textChanges: [], domChanges: [change] };
  assert.throws(() => validateImportPayload(payload), /parentSelector/);
  const restored = restoreSavedDomLocations(payload.domChanges);
  assert.equal(validateImportPayload({ ...payload, domChanges: restored }).domChanges[0].origin?.parentSelector, 'body');
  assert.equal(change.origin?.parentSelector, '', 'migration does not mutate the storage read');
  assert.equal(restoreSavedDomLocations([{ ...change, origin: { parentSelector: '#parent', index: 0 } }])[0].origin?.parentSelector, '#parent');
});
