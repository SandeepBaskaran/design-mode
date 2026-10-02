import { it } from 'node:test';
import assert from 'node:assert/strict';
import { openPresetDialog, persistPresetChange, validatePresetStyles } from './preset-dialog';

const preset = { id: 'one', name: 'Original', kind: 'fill', styles: { color: 'red' }, createdAt: 123 };

it('drops invalid CSS and blank values, normalizes property names, retains valid styles', () => {
  const calls: string[] = [];
  const result = validatePresetStyles({ backgroundColor: ' blue ', color: 'broken', opacity: '' }, (property, value) => {
    calls.push(property);
    return value === 'blue';
  });
  assert.deepEqual(result, { styles: { backgroundColor: 'blue' }, dropped: ['color', 'opacity'] });
  assert.deepEqual(calls, ['background-color', 'color']);
});

function storage(fail = false) {
  let saved: any[] = [structuredClone(preset), { ...preset, id: 'two' }];
  (globalThis as any).browser = { storage: { sync: {
    get: async () => ({ dm_custom_presets: structuredClone(saved) }),
    set: async (data: any) => { if (fail) throw new Error('Storage full'); saved = data.dm_custom_presets; },
  } } };
  return () => saved;
}

it('updates only name and styles while preserving identity, kind, timestamp and unrelated presets', async () => {
  const saved = storage();
  await persistPresetChange('one', { name: 'Renamed', styles: { color: 'blue' } });
  assert.deepEqual(saved()[0], { ...preset, name: 'Renamed', styles: { color: 'blue' } });
  assert.equal(saved()[1].name, 'Original');
  await persistPresetChange('one');
  assert.deepEqual(saved().map(p => p.id), ['two']);
  await assert.rejects(persistPresetChange('missing'), /no longer exists/);
});

it('propagates storage failures without changing the saved preset', async () => {
  const saved = storage(true);
  await assert.rejects(persistPresetChange('one'), /Storage full/);
  assert.equal(saved().length, 2);
});

class ElementStub {
  dataset: Record<string, string> = {};
  style = { cssText: '' };
  children: ElementStub[] = [];
  attributes: Record<string, string> = {};
  listeners: Record<string, (event: any) => void> = {};
  textContent = '';
  value = '';
  disabled = false;
  isConnected = true;
  modal = false;
  onclick: (() => any) | undefined;
  constructor(public tag: string) {}
  append(...elements: ElementStub[]) { this.children.push(...elements); }
  setAttribute(key: string, value: string) { this.attributes[key] = value; }
  addEventListener(type: string, callback: (event: any) => void) { this.listeners[type] = callback; }
  focus() { (globalThis as any).document.activeElement = this; }
  showModal() { this.modal = true; }
  close() { this.listeners.close?.({}); }
  remove() { this.isConnected = false; }
}

function dom() {
  const elements: ElementStub[] = [];
  const body = new ElementStub('body');
  const trigger = new ElementStub('button');
  trigger.dataset = { presetId: 'one', dmAction: 'delete-preset' };
  (globalThis as any).CSS = { supports: (_property: string, value: string) => value !== 'invalid' };
  (globalThis as any).document = {
    body, activeElement: trigger,
    createElement: (tag: string) => { const element = new ElementStub(tag); elements.push(element); return element; },
    createTextNode: (text: string) => Object.assign(new ElementStub('text'), { textContent: text }),
    querySelector: () => null,
    querySelectorAll: () => [trigger],
  };
  const toast: string[] = [];
  return { trigger, elements, toast, open: (mode: 'edit' | 'delete') => {
    openPresetDialog(preset, mode, trigger as any, async () => {}, (_kind, text) => toast.push(text));
    const dialog = elements.find(element => element.tag === 'dialog')!;
    const cancel = elements.find(element => element.textContent === 'Cancel')!;
    const confirm = elements.find(element => element.textContent === (mode === 'edit' ? 'Save' : 'Delete'))!;
    return { dialog, cancel, confirm };
  } };
}

it('delete opens a labelled native modal, focuses Cancel and does not delete until confirmed; cancel restores focus', async () => {
  const saved = storage();
  const fixture = dom();
  const { dialog, cancel } = fixture.open('delete');
  assert.ok(dialog.modal);
  assert.equal(dialog.attributes['aria-labelledby'], 'dm-preset-dialog-title');
  assert.equal(dialog.attributes['aria-describedby'], 'dm-preset-dialog-description');
  assert.equal(document.activeElement, cancel);
  assert.equal(saved().length, 2);
  let prevented = false;
  dialog.listeners.cancel({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, false, 'Escape uses native dialog cancellation');
  cancel.onclick!();
  assert.equal(document.activeElement, fixture.trigger);
  assert.equal(saved().length, 2);
});

it('confirmed delete persists once and closes', async () => {
  const saved = storage();
  const fixture = dom();
  const { confirm, dialog } = fixture.open('delete');
  await Promise.all([confirm.onclick!(), confirm.onclick!()]);
  assert.deepEqual(saved().map(p => p.id), ['two']);
  assert.equal(dialog.isConnected, false);
});

it('editor locks kind, saves renamed preset, drops invalid CSS with toast', async () => {
  const saved = storage();
  const fixture = dom();
  const { confirm, dialog } = fixture.open('edit');
  const inputs = fixture.elements.filter(element => element.tag === 'input');
  assert.equal(document.activeElement, inputs[0]);
  assert.ok(fixture.elements.some(element => element.textContent === 'fill · Kind locked'));
  assert.equal(fixture.elements.some(element => element.tag === 'select'), false);
  inputs[0].value = 'Renamed';
  inputs[1].value = 'invalid';
  await confirm.onclick!();
  assert.deepEqual(saved()[0], { ...preset, name: 'Renamed', styles: {} });
  assert.match(fixture.toast[0], /Dropped invalid CSS: color/);
  assert.equal(dialog.isConnected, false);
});

it('failed dialog save retains draft, stays open, and permits retry/cancel', async () => {
  storage(true);
  const fixture = dom();
  const { confirm, dialog, cancel } = fixture.open('edit');
  fixture.elements.find(element => element.tag === 'input')!.value = 'Keep draft';
  await confirm.onclick!();
  assert.equal(dialog.isConnected, true);
  assert.equal(confirm.disabled, false);
  assert.equal(fixture.elements.find(element => element.tag === 'input')!.value, 'Keep draft');
  assert.match(fixture.toast[0], /Storage full/);
  cancel.onclick!();
  assert.equal(dialog.isConnected, false);
});
