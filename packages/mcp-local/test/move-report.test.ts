import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../src/state.js';

test('move reports retain origin/destination and refreshed selectors', () => {
  state.clear();
  const selector = '#new > div.card:nth-of-type(2)';
  const origin = { parentSelector: '#old', index: 0, parentId: 'dm-old' };
  const destination = { parentSelector: '#new', index: 1, parentId: 'dm-new' };
  state.addStyleChange({ id: 'style', elementId: 'dm-card', selector: '#old > div.card:nth-of-type(1)', property: 'opacity', oldValue: '1', newValue: '0.7', timestamp: 1 });
  state.replaceChanges({
    styleChanges: [{ ...state.getStyleChanges()[0], selector }],
    domChanges: [{ id: 'move', elementId: 'dm-card', selector, action: 'move', tagName: 'div', timestamp: 2, origin, destination }],
  });
  const report = state.getFullChangeReport() as { styleChanges: Array<{ selector: string }>; domChanges: Array<{ selector: string; origin: unknown; destination: unknown }>; items: Array<{ selector: string }> };
  assert.deepEqual(report.domChanges[0].origin, origin);
  assert.deepEqual(report.domChanges[0].destination, destination);
  assert.equal(report.domChanges[0].selector, selector);
  assert.equal(report.styleChanges[0].selector, selector);
  assert(report.items.every(item => item.selector === selector));
  state.clear();
});
