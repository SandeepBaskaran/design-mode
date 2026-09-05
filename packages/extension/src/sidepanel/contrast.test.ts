import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { contrastRatio } from './contrast.ts';

describe('contrastRatio sanity', () => {
  it('black on white is 21', () => {
    assert.equal(contrastRatio([0, 0, 0], [255, 255, 255]), 21);
  });
});
