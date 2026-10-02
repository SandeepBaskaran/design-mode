import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isViewportPageElement } from './viewport-page';
import { withPresetUsageCounts, type Preset } from './presets';

test('viewport consumers exclude overlays, hidden and out-of-view elements', () => {
  const saved = Object.getOwnPropertyDescriptors(globalThis);
  Object.assign(globalThis, { window: { innerHeight: 600, innerWidth: 800 }, getComputedStyle: (el: any) => el.computed });
  const element = (rect = {}, computed = {}, overlay = false) => ({
    closest: () => overlay,
    getBoundingClientRect: () => ({ width: 20, height: 20, top: 20, bottom: 40, left: 20, right: 40, ...rect }),
    computed: { display: 'block', visibility: 'visible', ...computed },
  }) as unknown as Element;
  try {
    assert.equal(isViewportPageElement(element()), true);
    assert.equal(isViewportPageElement(element({}, {}, true)), false);
    assert.equal(isViewportPageElement(element({ top: 600, bottom: 620 })), false);
    assert.equal(isViewportPageElement(element({ left: 800, right: 820 })), false);
    assert.equal(isViewportPageElement(element({}, { visibility: 'hidden' })), false);
    assert.equal(isViewportPageElement(element({ width: 0 })), false);
    const pageElement = element() as any;
    pageElement.computed.getPropertyValue = (prop: string) => prop === 'padding-top' ? '13px' : '9px';
    Object.assign(globalThis, { document: { querySelectorAll: () => [pageElement, element({}, {}, true)] } });
    const preset = (styles: Record<string, string>): Preset => ({ id: 'fixture', name: 'Fixture', kind: 'layout', styles, createdAt: 0 });
    const presets = [preset({ paddingTop: '13px' }), preset({ paddingTop: '199px' }), preset({ paddingTop: '13px', borderRadius: '8px' }), preset({})];
    assert.deepEqual(withPresetUsageCounts(presets).map(p => p.usageCount), [1, 0, 0, 0]);
    assert.equal('usageCount' in presets[0], false);
  } finally {
    for (const key of ['window', 'document', 'getComputedStyle']) {
      if (saved[key]) Object.defineProperty(globalThis, key, saved[key]);
      else delete (globalThis as any)[key];
    }
  }
});
