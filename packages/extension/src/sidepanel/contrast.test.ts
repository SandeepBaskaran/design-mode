import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  contrastRatio,
  pickAccessibleColourToken,
  suggestAccessibleForeground,
} from './contrast.ts';

describe('suggestAccessibleForeground', () => {
  it('returns null when the pair already meets the threshold', () => {
    assert.equal(suggestAccessibleForeground([0, 0, 0, 1], [255, 255, 255], 4.5), null);
  });
  it('darkens light grey on white until AA', () => {
    const sug = suggestAccessibleForeground([200, 200, 200, 1], [255, 255, 255], 4.5);
    assert.ok(sug);
    assert.ok(sug.ratio >= 4.5);
    assert.ok(sug.rgb[0] < 200);
    assert.match(sug.hex, /^#[0-9a-f]{6}$/);
  });
  it('lightens dark grey on black until AA', () => {
    const sug = suggestAccessibleForeground([40, 40, 40, 1], [0, 0, 0], 4.5);
    assert.ok(sug);
    assert.ok(sug.ratio >= 4.5);
    assert.ok(sug.rgb[0] > 40);
  });
});

describe('pickAccessibleColourToken', () => {
  it('prefers a same-family token that passes', () => {
    const picked = pickAccessibleColourToken(
      [
        { cssVar: '--cds-text-secondary', resolvedValue: 'rgb(200, 200, 200)' },
        { cssVar: '--cds-text-primary', resolvedValue: 'rgb(0, 0, 0)' },
        { cssVar: '--brand-accent', resolvedValue: 'rgb(0, 0, 0)' },
      ],
      [255, 255, 255],
      4.5,
      '--cds-text-secondary',
    );
    assert.ok(picked);
    assert.equal(picked.cssVar, '--cds-text-primary');
    assert.ok(picked.ratio >= 4.5);
  });
  it('skips tokens that still fail', () => {
    const picked = pickAccessibleColourToken(
      [{ cssVar: '--fg', resolvedValue: 'rgb(240, 240, 240)' }],
      [255, 255, 255],
      4.5,
    );
    assert.equal(picked, null);
  });
});

describe('contrastRatio sanity', () => {
  it('black on white is 21', () => {
    assert.equal(contrastRatio([0, 0, 0], [255, 255, 255]), 21);
  });
});
