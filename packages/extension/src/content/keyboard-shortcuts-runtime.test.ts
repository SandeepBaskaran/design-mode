import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { disableShortcuts, enableShortcuts, loadShortcuts, registerShortcut, triggerShortcut } from './keyboard-shortcuts';

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const originalBrowser = Object.getOwnPropertyDescriptor(globalThis, 'browser');
const document = new EventTarget();
let saved: unknown;
const listeners: Array<(changes: Record<string, { newValue?: unknown }>, area: string) => void> = [];
Object.assign(globalThis, {
  document,
  browser: {
    storage: {
      local: { get: async () => ({ 'dm-shortcuts': saved }) },
      onChanged: { addListener: (listener: typeof listeners[number]) => listeners.push(listener) },
    },
  },
});

after(() => {
  disableShortcuts();
  for (const [key, descriptor] of [['document', originalDocument], ['browser', originalBrowser]] as const) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

function optionI() {
  const event = Object.assign(new Event('keydown', { cancelable: true }), {
    key: 'Dead', code: 'KeyI', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false,
  });
  document.dispatchEvent(event);
  return event.defaultPrevented;
}

test('remote shortcut dispatch requires an enabled, registered action', () => {
  let calls = 0;
  registerShortcut('toggle-inspect', () => calls++);
  assert.equal(triggerShortcut('toggle-inspect'), false);
  enableShortcuts();
  assert.equal(triggerShortcut('toggle-inspect'), true);
  assert.equal(triggerShortcut('unknown-action'), false);
  disableShortcuts();
  assert.equal(triggerShortcut('toggle-inspect'), false);
  assert.equal(calls, 1);
});

test('real keydown dispatcher recovers empty, partial and malformed stored settings', async () => {
  let calls = 0;
  registerShortcut('toggle-inspect', () => calls++);
  for (saved of [[], [{ action: 'add-annotation', key: 'k', modifiers: ['alt'] }], [{ action: 'toggle-inspect', key: 42 }]]) {
    await loadShortcuts();
    enableShortcuts();
    assert.equal(optionI(), true);
    disableShortcuts();
  }
  assert.equal(calls, 3);
});

test('live settings removal restores defaults without duplicating the listener', async () => {
  saved = [{ action: 'toggle-inspect', key: 'k', modifiers: ['alt'] }];
  await loadShortcuts();
  enableShortcuts();
  assert.equal(optionI(), false);
  assert.equal(listeners.length, 1);
  listeners[0]({ 'dm-shortcuts': {} }, 'local');
  assert.equal(optionI(), true);
  disableShortcuts();
});
