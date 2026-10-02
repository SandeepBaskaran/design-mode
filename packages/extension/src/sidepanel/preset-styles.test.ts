import assert from 'node:assert/strict';
import test from 'node:test';
import { hasPresetStyles } from '../preset-styles';

const defaults = {
  transition: 'all', transitionProperty: 'all', transitionDuration: '0s',
  transitionDelay: '0s', transitionTimingFunction: 'ease', animationName: 'none',
  animationDuration: '0s', animationIterationCount: '1', animationPlayState: 'running',
  transform: 'none', transformOrigin: '100px 20px', transformBox: 'view-box',
  transformStyle: 'flat', backfaceVisibility: 'visible', perspectiveOrigin: '100px 20px',
  offsetRotate: 'auto 0deg', offsetDistance: '0px', scrollTimelineAxis: 'block',
  viewTimelineAxis: 'block', animationRange: 'normal', animationTimeline: 'auto',
};

test('default motion parameters do not make an inert element eligible', () => {
  assert.equal(hasPresetStyles('motion', defaults, Object.keys(defaults)), false);
  assert.equal(hasPresetStyles('motion', { ...defaults, transitionDuration: '0s, 0s' }, []), false);
});

test('authored motion effects remain eligible', () => {
  for (const override of [{ transitionDuration: '0s, 120ms' }, { transitionDelay: '1s' },
    { transformStyle: 'preserve-3d' }, { backfaceVisibility: 'hidden' }, { animationName: 'pulse' },
    { transform: 'matrix(1, 0, 0, 1, 0, 4)' }, { translate: '0px 4px' },
    { offsetPath: 'path("M0 0 L10 10")' }, { scrollTimelineName: '--scroll' }]) {
    assert.equal(hasPresetStyles('motion', { ...defaults, ...override }, []), true);
  }
  assert.equal(hasPresetStyles('motion', { ...defaults, transitionProperty: 'none', transitionDuration: '1s' }, []), false);
});

test('other preset kinds retain their existing default exclusion', () => {
  assert.equal(hasPresetStyles('typography', { fontSize: '30px' }, ['fontSize']), true);
  assert.equal(hasPresetStyles('effects', { boxShadow: 'none', filter: 'none' }, ['boxShadow', 'filter']), false);
  assert.equal(hasPresetStyles('layout', { gap: '0px' }, ['gap']), false);
});
