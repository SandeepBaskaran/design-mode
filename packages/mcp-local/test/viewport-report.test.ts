import assert from 'node:assert/strict';
import test from 'node:test';
import { state } from '../src/state.js';

test('MCP report retains edit-time viewport metadata for style, text and DOM', () => {
  state.clear();
  const context = { viewportWidth: 600, breakpoint: 'mobile' as const };
  const common = { elementId: 'dm-one', selector: '#heading', timestamp: 1, ...context };
  state.addStyleChange({ ...common, id: 'style', property: 'color', oldValue: 'black', newValue: 'red' });
  state.addTextChange({ ...common, id: 'text', oldText: 'old', newText: 'new' });
  state.addDomChange({ ...common, id: 'dom', action: 'duplicate', tagName: 'h1' });
  const report = state.getFullChangeReport() as Record<string, any[]>;
  for (const kind of ['styleChanges', 'textChanges', 'domChanges']) {
    assert.equal(report[kind][0].viewportWidth, 600);
    assert.equal(report[kind][0].breakpoint, 'mobile');
  }
  state.clear();
  state.addStyleChange({ id: 'old', elementId: 'dm-old', selector: '#old', timestamp: 1, property: 'color', oldValue: 'black', newValue: 'red' });
  const legacy = state.getFullChangeReport() as Record<string, any[]>;
  assert.equal(Object.hasOwn(legacy.styleChanges[0], 'viewportWidth'), false);
  assert.equal(Object.hasOwn(legacy.styleChanges[0], 'breakpoint'), false);
  state.clear();
});
