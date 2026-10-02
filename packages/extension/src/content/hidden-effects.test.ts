import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rebaseHiddenEffectValue } from './hidden-effects';

const stash = (id: string, raw = 'hidden') => JSON.stringify([{ id, raw }]);

test('effect edits preserve an empty stash and same-length identities', () => {
  assert.equal(rebaseHiddenEffectValue('[]', 'boxShadow', 'red 1px 2px', 'none'), '[]');
  const saved = stash('box:1');
  assert.equal(rebaseHiddenEffectValue(saved, 'boxShadow', 'red 1px 2px', 'blue 9px 2px'), saved);
  assert.equal(rebaseHiddenEffectValue(saved, 'opacity', '1', '0'), saved);
});

test('each target rebases its own hidden boundary and retains other chains', () => {
  const saved = JSON.stringify([{id:'box:1',raw:'green 22px 2px'}, {id:'layer-blur:0',raw:'blur(5px)'}]);
  const after = rebaseHiddenEffectValue(saved, 'boxShadow', 'red 11px 2px, blue 33px 2px', 'red 77px 2px, green 22px 2px, blue 33px 2px');
  assert.deepEqual(JSON.parse(after), [{id:'box:2',raw:'green 22px 2px'}, {id:'layer-blur:0',raw:'blur(5px)'}]);
});

test('nested filter and shadow functions are single chain entries', () => {
  assert.equal(rebaseHiddenEffectValue(stash('layer-blur:1'), 'filter', 'drop-shadow(rgb(1, 2, 3) 1px 2px) blur(2px)', 'blur(2px)'), stash('layer-blur:0'));
  assert.equal(rebaseHiddenEffectValue(stash('box:1'), 'boxShadow', 'rgb(1, 2, 3) 1px 2px, blue 3px 4px', 'blue 3px 4px'), stash('box:0'));
});

test('multiple hidden slots retain order when the whole visible chain disappears', () => {
  const saved = JSON.stringify([{id:'box:1',raw:'first'}, {id:'box:3',raw:'second'}]);
  assert.deepEqual(JSON.parse(rebaseHiddenEffectValue(saved,'boxShadow','red 1px 2px, blue 3px 4px','none')), [{id:'box:0',raw:'first'}, {id:'box:1',raw:'second'}]);
});
