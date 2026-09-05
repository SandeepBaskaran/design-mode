import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildForceStateCss,
  declsFromStyle,
  emptyInspectedStates,
  forceClassFromState,
  inspectPseudosInCompound,
  inspectStatesFromRules,
  lastCompound,
  selectorContainsVisited,
  splitSelectorList,
  stripInspectPseudos,
  type StyleLike,
} from './inspect-states.ts';

function style(decls: Array<[string, string, boolean?]>): StyleLike {
  const props = decls.map(([p]) => p);
  const map = new Map(decls.map(([p, v, imp]) => [p, { v, imp: !!imp }]));
  return {
    length: props.length,
    item: (i) => props[i] ?? null,
    getPropertyValue: (n) => map.get(n)?.v || '',
    getPropertyPriority: (n) => map.get(n)?.imp ? 'important' : '',
  };
}

describe('selector parsing', () => {
  it('splits lists without breaking :not() commas', () => {
    assert.deepEqual(
      splitSelectorList('a:hover, :not(.x, .y):focus, button:active'),
      ['a:hover', ':not(.x, .y):focus', 'button:active'],
    );
  });
  it('never treats :visited as inspectable', () => {
    assert.equal(selectorContainsVisited('a:visited'), true);
    assert.equal(selectorContainsVisited('a:visited:hover'), true);
    assert.equal(selectorContainsVisited('a:hover'), false);
  });
  it('reads inspect pseudos from the subject compound only', () => {
    assert.deepEqual(inspectPseudosInCompound(lastCompound('.card:hover .title')), []);
    assert.deepEqual(inspectPseudosInCompound(lastCompound('button:hover')), [':hover']);
    assert.deepEqual(inspectPseudosInCompound(lastCompound('a:focus-visible:hover')), [':focus-visible', ':hover']);
  });
  it('strips inspect pseudos without dropping :nth-child', () => {
    assert.equal(stripInspectPseudos('li:nth-child(2):hover'), 'li:nth-child(2)');
  });
  it('maps FORCE_STATE class names the same way as change-tracker', () => {
    assert.equal(forceClassFromState(':hover'), 'dm-force-hover');
    assert.equal(forceClassFromState(':focus-visible'), 'dm-force-focus-visible');
    assert.equal(forceClassFromState(':active'), 'dm-force-active');
  });
});

describe('inspectStatesFromRules', () => {
  const matching = new Set(['.btn', 'a.nav']);
  const matches = (sel: string) => matching.has(sel);

  it('collects hover decls without requiring a classList mutation', () => {
    const states = inspectStatesFromRules([
      { selectorText: '.btn:hover', style: style([['color', 'red'], ['background-color', 'black']]) },
    ], matches);
    assert.equal(states[':hover'].length, 2);
    assert.equal(states[':hover'][0].property, 'color');
    assert.equal(states[':focus'].length, 0);
  });
  it('skips :visited even when combined with :hover', () => {
    const states = inspectStatesFromRules([
      { selectorText: 'a.nav:visited:hover', style: style([['color', 'purple']]) },
      { selectorText: 'a.nav:hover', style: style([['color', 'blue']]) },
    ], matches);
    assert.deepEqual(states[':hover'].map((d) => d.value), ['blue']);
  });
  it('ignores descendant hover subjects', () => {
    const states = inspectStatesFromRules([
      { selectorText: '.btn:hover .icon', style: style([['opacity', '1']]) },
    ], () => true);
    assert.equal(states[':hover'].length, 0);
  });
  it('later rules override the same property', () => {
    const states = inspectStatesFromRules([
      { selectorText: '.btn:hover', style: style([['color', 'red']]) },
      { selectorText: '.btn:hover', style: style([['color', 'green']]) },
    ], matches);
    assert.deepEqual(states[':hover'], [{ property: 'color', value: 'green', important: false }]);
  });
  it('drops javascript: values', () => {
    const d = declsFromStyle(style([['background-image', 'javascript:alert(1)']]));
    assert.equal(d.length, 0);
  });
});

describe('buildForceStateCss', () => {
  it('emits element-scoped dm-force rules', () => {
    const states = emptyInspectedStates();
    states[':hover'] = [{ property: 'color', value: 'red', important: false }];
    const css = buildForceStateCss('dm-12', states);
    assert.match(css, /\[data-dm-id="dm-12"\]\[data-dm-id\]\.dm-force-hover/);
    assert.match(css, /color: red !important;/);
  });
  it('rejects unexpected element ids', () => {
    const states = emptyInspectedStates();
    states[':hover'] = [{ property: 'color', value: 'red', important: false }];
    assert.equal(buildForceStateCss('x"{}', states), '');
  });
});
