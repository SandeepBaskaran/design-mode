import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  authoredDimensionFromWinner,
  classifyAuthoredValue,
  collectScopedSheets,
  declBeats,
  harvestSizeDecls,
  pickWinner,
  resolveAuthoredDimensions,
  sizeFieldView,
  sizeModeFromValue,
  specificityTuple,
  unknownDimension,
  type CascadeDecl,
} from './authored-sizing.ts';

function decl(partial: Partial<CascadeDecl> & { value: string; property?: 'width' | 'height' }): CascadeDecl {
  return {
    property: partial.property || 'width',
    value: partial.value,
    important: partial.important ?? false,
    spec: partial.spec || [0, 0, 1],
    order: partial.order ?? 0,
    origin: partial.origin || 'author',
    layerIndex: partial.layerIndex === undefined ? null : partial.layerIndex,
    unsupported: partial.unsupported ?? false,
  };
}

describe('classifyAuthoredValue', () => {
  it('keeps auto, percent, rem, calc, var, and intrinsic distinct', () => {
    assert.equal(classifyAuthoredValue('auto'), 'auto');
    assert.equal(classifyAuthoredValue('50%'), 'percent');
    assert.equal(classifyAuthoredValue('2rem'), 'length');
    assert.equal(classifyAuthoredValue('240px'), 'px');
    assert.equal(classifyAuthoredValue('calc(100% - 16px)'), 'calc');
    assert.equal(classifyAuthoredValue('var(--size-8)'), 'var');
    assert.equal(classifyAuthoredValue('fit-content'), 'intrinsic');
    assert.equal(classifyAuthoredValue('max-content'), 'intrinsic');
    assert.equal(classifyAuthoredValue('min(10px, 20%)'), 'calc');
  });
});

describe('sizeModeFromValue', () => {
  it('does not treat auto as Hug', () => {
    assert.equal(sizeModeFromValue('auto'), 'auto');
    assert.equal(sizeModeFromValue('fit-content'), 'hug');
    assert.equal(sizeModeFromValue('max-content'), 'hug');
    assert.equal(sizeModeFromValue('min-content'), 'hug');
  });
  it('maps fill keywords and 100% to Fill, other lengths to Fixed', () => {
    assert.equal(sizeModeFromValue('100%'), 'fill');
    assert.equal(sizeModeFromValue('stretch'), 'fill');
    assert.equal(sizeModeFromValue('50%'), 'fixed');
    assert.equal(sizeModeFromValue('2rem'), 'fixed');
    assert.equal(sizeModeFromValue('12px'), 'fixed');
  });
  it('does not infer Fixed from calc/var/unknown', () => {
    assert.equal(sizeModeFromValue('calc(100% - 8px)'), 'unknown');
    assert.equal(sizeModeFromValue('var(--w)'), 'unknown');
    assert.equal(sizeModeFromValue(''), 'unknown');
  });
});

describe('specificityTuple', () => {
  it('counts ids, classes, types, :where, and :is', () => {
    assert.deepEqual(specificityTuple('div'), [0, 0, 1]);
    assert.deepEqual(specificityTuple('.card'), [0, 1, 0]);
    assert.deepEqual(specificityTuple('#hero'), [1, 0, 0]);
    assert.deepEqual(specificityTuple('div.card:hover'), [0, 2, 1]);
    assert.deepEqual(specificityTuple(':where(.card)'), [0, 0, 0]);
    assert.deepEqual(specificityTuple(':is(.card, #hero)'), [1, 0, 0]);
    assert.deepEqual(specificityTuple(':not(.card)'), [0, 1, 0]);
  });
});

describe('cascade', () => {
  it('lets higher specificity win over source order', () => {
    const win = pickWinner([
      decl({ value: '10px', spec: [0, 0, 1], order: 2 }),
      decl({ value: '20px', spec: [0, 1, 0], order: 1 }),
    ]);
    assert.equal(win?.value, '20px');
  });
  it('lets !important beat a more specific normal declaration', () => {
    const win = pickWinner([
      decl({ value: '10px', spec: [1, 0, 0], important: false, order: 2 }),
      decl({ value: '30px', spec: [0, 0, 1], important: true, order: 1 }),
    ]);
    assert.equal(win?.value, '30px');
  });
  it('lets inline beat an equally important stylesheet rule', () => {
    const win = pickWinner([
      decl({ value: '10px', spec: [0, 1, 0], origin: 'author', order: 1 }),
      decl({ value: '40px', spec: [0, 0, 0], origin: 'inline', order: 2 }),
    ]);
    assert.equal(win?.value, '40px');
  });
  it('lets stylesheet !important beat inline normal', () => {
    const win = pickWinner([
      decl({ value: '10px', spec: [0, 0, 0], origin: 'inline', important: false, order: 2 }),
      decl({ value: '50px', spec: [0, 0, 1], origin: 'author', important: true, order: 1 }),
    ]);
    assert.equal(win?.value, '50px');
  });
  it('lets later unlayered rules beat earlier layers for normal decls', () => {
    const laterUnlayered = decl({ value: 'unlayered', layerIndex: null, order: 1, spec: [0, 0, 1] });
    const layered = decl({ value: 'layered', layerIndex: 0, order: 2, spec: [0, 0, 1] });
    assert.equal(declBeats(laterUnlayered, layered), true);
  });
});

describe('authoredDimensionFromWinner', () => {
  it('reports auto when nothing authored and the cascade is fully readable', () => {
    const dim = authoredDimensionFromWinner(null, '240px', { inaccessible: false, truncated: false });
    assert.equal(dim.authored, 'auto');
    assert.equal(dim.mode, 'auto');
    assert.equal(dim.known, true);
    assert.equal(dim.computed, '240px');
  });
  it('does not infer Fixed from computed pixels when sheets are inaccessible', () => {
    const dim = authoredDimensionFromWinner(
      decl({ value: '10px' }),
      '240px',
      { inaccessible: true, truncated: false },
    );
    assert.equal(dim.known, false);
    assert.equal(dim.mode, 'unknown');
    assert.equal(dim.authored, null);
  });
  it('trusts inline !important even when other sheets are inaccessible', () => {
    const dim = authoredDimensionFromWinner(
      decl({ value: '2rem', origin: 'inline', important: true }),
      '32px',
      { inaccessible: true, truncated: false },
    );
    assert.equal(dim.known, true);
    assert.equal(dim.authored, '2rem');
    assert.equal(dim.mode, 'fixed');
  });
  it('returns unknown when the winning rule sits in an unsupported construct', () => {
    const dim = authoredDimensionFromWinner(
      decl({ value: '80%', unsupported: true }),
      '400px',
      { inaccessible: false, truncated: false },
    );
    assert.equal(dim.known, false);
    assert.equal(dim.mode, 'unknown');
  });
});

describe('resolveAuthoredDimensions', () => {
  it('resolves width and height independently', () => {
    const out = resolveAuthoredDimensions({
      widthDecls: [decl({ property: 'width', value: '50%' })],
      heightDecls: [decl({ property: 'height', value: 'auto' })],
      computedWidth: '200px',
      computedHeight: '18px',
      inaccessible: false,
      truncated: false,
    });
    assert.equal(out.width.authored, '50%');
    assert.equal(out.width.mode, 'fixed');
    assert.equal(out.height.authored, 'auto');
    assert.equal(out.height.mode, 'auto');
  });
});

describe('sizeFieldView', () => {
  it('shows authored rem distinctly from computed px', () => {
    const view = sizeFieldView({
      dim: {
        authored: '2rem',
        computed: '32px',
        kind: 'length',
        mode: 'fixed',
        known: true,
        important: false,
      },
      computed: '32px',
    });
    assert.equal(view.mode, 'fixed');
    assert.equal(view.displayValue, '2');
    assert.equal(view.displayUnit, 'rem');
    assert.equal(view.editable, true);
    assert.equal(view.computedHint, '32px');
  });
  it('shows auto rather than Hug, with computed px as the hint', () => {
    const view = sizeFieldView({
      dim: authoredDimensionFromWinner(null, '240px', { inaccessible: false, truncated: false }),
      computed: '240px',
    });
    assert.equal(view.mode, 'auto');
    assert.equal(view.displayValue, 'auto');
    assert.equal(view.editable, false);
    assert.equal(view.computedHint, '240px');
  });
  it('does not present computed pixels as Fixed when intent is unknown', () => {
    const view = sizeFieldView({
      dim: unknownDimension('240px'),
      computed: '240px',
    });
    assert.equal(view.mode, 'unknown');
    assert.equal(view.editable, false);
    assert.equal(view.displayValue, '—');
    assert.equal(view.computedHint, '240px');
  });
  it('prefers a session override over page-authored values', () => {
    const view = sizeFieldView({
      dim: {
        authored: 'auto',
        computed: '100px',
        kind: 'auto',
        mode: 'auto',
        known: true,
        important: false,
      },
      override: 'fit-content',
      computed: '80px',
    });
    assert.equal(view.mode, 'hug');
    assert.equal(view.displayValue, 'fit-content');
  });
  it('keeps percent and var authored text out of the px box', () => {
    const pct = sizeFieldView({
      dim: {
        authored: '50%',
        computed: '160px',
        kind: 'percent',
        mode: 'fixed',
        known: true,
        important: false,
      },
      computed: '160px',
    });
    assert.equal(pct.displayValue, '50');
    assert.equal(pct.displayUnit, '%');
    const v = sizeFieldView({
      dim: {
        authored: 'var(--box)',
        computed: '160px',
        kind: 'var',
        mode: 'unknown',
        known: true,
        important: false,
      },
      computed: '160px',
    });
    assert.equal(v.mode, 'unknown');
    assert.equal(v.displayValue, 'var(--box)');
    assert.equal(v.editable, false);
    assert.equal(v.computedHint, '160px');
  });
});

function ruleList(rules: object[]): CSSRuleList {
  return Object.assign(rules.slice(), { length: rules.length }) as unknown as CSSRuleList;
}

function styleDecls(decls: Record<string, string>) {
  const keys = Object.keys(decls);
  return {
    length: keys.length,
    item: (i: number) => keys[i] ?? null,
    getPropertyValue: (n: string) => (decls[n] || '').replace(/\s*!important\s*$/i, '').trim(),
    getPropertyPriority: (n: string) => /!important/i.test(decls[n] || '') ? 'important' : '',
  };
}

function named(name: string, extra: object) {
  const Ctor = { name };
  return Object.assign(Object.create({ constructor: Ctor }), extra, { constructor: Ctor });
}

function styleRule(selectorText: string, decls: Record<string, string>, nested: object[] = []) {
  return named('CSSStyleRule', {
    selectorText,
    style: styleDecls(decls),
    cssRules: ruleList(nested),
  });
}

function mediaRule(conditionText: string, nested: object[]) {
  return named('CSSMediaRule', { conditionText, cssRules: ruleList(nested) });
}

function layerBlock(layerName: string, nested: object[]) {
  return named('CSSLayerBlockRule', { name: layerName, cssRules: ruleList(nested) });
}

function layerStatement(names: string[]) {
  return named('CSSLayerStatementRule', { nameList: names, cssText: `@layer ${names.join(', ')};` });
}

function nestedDecls(decls: Record<string, string>) {
  return named('CSSNestedDeclarations', { style: styleDecls(decls) });
}

function unknownGroup(nested: object[]) {
  return named('CSSPageRule', { cssRules: ruleList(nested) });
}

function sheet(rules: object[], opts: { disabled?: boolean; media?: string } = {}) {
  return {
    disabled: !!opts.disabled,
    media: { mediaText: opts.media ?? 'all', length: 1 },
    ownerNode: null,
    cssRules: ruleList(rules),
  } as unknown as CSSStyleSheet;
}

function harvest(sheets: CSSStyleSheet[], selector = '.target') {
  return harvestSizeDecls({
    sheets,
    matches: (sel) => sel.trim() === selector || sel.trim() === '.target',
    matchMedia: (query) => {
      const q = query.toLowerCase();
      if (!q || q === 'all' || q.includes('screen') || q.includes('min-width: 1px')) return true;
      return false;
    },
  });
}

function resolved(sheets: CSSStyleSheet[], selector = '.target') {
  const h = harvest(sheets, selector);
  return resolveAuthoredDimensions({
    widthDecls: h.widthDecls,
    heightDecls: h.heightDecls,
    computedWidth: '240px',
    computedHeight: '18px',
    inaccessible: h.inaccessible,
    truncated: h.truncated,
  });
}

describe('harvestSizeDecls', () => {
  it('keeps common authored percent, rem, auto, and calc', () => {
    const sheets = [sheet([
      styleRule('.target', { width: '50%', height: '2rem' }),
    ])];
    const dim = resolved(sheets);
    assert.equal(dim.width.known, true);
    assert.equal(dim.width.authored, '50%');
    assert.equal(dim.width.mode, 'fixed');
    assert.equal(dim.height.authored, '2rem');
    assert.equal(dim.height.kind, 'length');

    const calc = resolved([sheet([styleRule('.target', { width: 'calc(100% - 16px)', height: 'auto' })])]);
    assert.equal(calc.width.known, true);
    assert.equal(calc.width.kind, 'calc');
    assert.equal(calc.height.mode, 'auto');
  });

  it('does not report known auto when only logical inline-size/block-size is authored', () => {
    const dim = resolved([sheet([styleRule('.target', { 'inline-size': '200px' })])]);
    assert.equal(dim.width.known, false);
    assert.equal(dim.width.mode, 'unknown');
    assert.notEqual(dim.width.authored, 'auto');
    assert.equal(dim.height.known, false);
  });

  it('harvests nested & rules as unsupported instead of skipping to auto', () => {
    const dim = resolved([sheet([
      styleRule('.target', {}, [
        styleRule('&', { width: '33px' }),
      ]),
    ])]);
    assert.equal(dim.width.known, false);
    assert.notEqual(dim.width.authored, 'auto');
  });

  it('harvests CSSNestedDeclarations as unsupported instead of skipping to auto', () => {
    const dim = resolved([sheet([
      styleRule('.target', { color: 'red' }, [
        nestedDecls({ height: '20px' }),
      ]),
    ])]);
    assert.equal(dim.height.known, false);
    assert.notEqual(dim.height.authored, 'auto');
  });

  it('marks nested cascade layers unsupported rather than using a flat index', () => {
    const dim = resolved([sheet([
      layerBlock('base', [
        styleRule('.target', { width: '1px' }),
        layerBlock('inner', [
          styleRule('.target', { width: '2px' }),
        ]),
      ]),
    ])]);
    assert.equal(dim.width.known, false);
    assert.notEqual(dim.width.authored, '2px');
  });

  it('marks dotted layer names unsupported', () => {
    const dim = resolved([sheet([
      layerStatement(['a.b']),
      layerBlock('a.b', [styleRule('.target', { width: '3px' })]),
    ])]);
    assert.equal(dim.width.known, false);
    assert.notEqual(dim.width.authored, '3px');
  });

  it('still resolves flat top-level layers', () => {
    const dim = resolved([sheet([
      layerStatement(['a', 'b']),
      layerBlock('a', [styleRule('.target', { width: '1px' })]),
      layerBlock('b', [styleRule('.target', { width: '8px' })]),
    ])]);
    assert.equal(dim.width.known, true);
    assert.equal(dim.width.authored, '8px');
  });

  it('skips disabled stylesheets', () => {
    const dim = resolved([
      sheet([styleRule('.target', { width: '1px' })], { disabled: true }),
    ]);
    assert.equal(dim.width.known, true);
    assert.equal(dim.width.authored, 'auto');
  });

  it('skips stylesheets whose media does not match', () => {
    const dim = resolved([
      sheet([styleRule('.target', { width: '1px' })], { media: 'print' }),
    ]);
    assert.equal(dim.width.authored, 'auto');
  });

  it('marks unknown grouping rules unsupported', () => {
    const dim = resolved([sheet([
      unknownGroup([styleRule('.target', { width: '50%' })]),
    ])]);
    assert.equal(dim.width.known, false);
    assert.notEqual(dim.width.authored, '50%');
  });

  it('still harvests matching media rules', () => {
    const dim = resolved([sheet([
      mediaRule('(min-width: 1px)', [styleRule('.target', { width: '77px' })]),
    ])]);
    assert.equal(dim.width.known, true);
    assert.equal(dim.width.authored, '77px');
  });

  it('does not apply unmatched nested & rules to other elements', () => {
    const dim = resolved([sheet([
      styleRule('.other', {}, [
        styleRule('&', { width: '33px' }),
      ]),
      styleRule('.target', { width: '50%' }),
    ])]);
    assert.equal(dim.width.known, true);
    assert.equal(dim.width.authored, '50%');
  });
});

describe('collectScopedSheets', () => {
  it('uses the shadow root styleSheets and adoptedStyleSheets, not the document', () => {
    const shadowSheet = sheet([styleRule('.target', { width: '9px' })]);
    const adopted = sheet([styleRule('.target', { height: '4px' })]);
    const docSheet = sheet([styleRule('.target', { width: '1px' })]);
    const shadowRoot = named('ShadowRoot', {
      styleSheets: [shadowSheet],
      adoptedStyleSheets: [adopted],
    });
    const scoped = collectScopedSheets({ getRootNode: () => shadowRoot });
    assert.equal(scoped.inaccessible, false);
    assert.equal(scoped.sheets.length, 2);
    assert.equal(scoped.sheets[0], shadowSheet);
    assert.equal(scoped.sheets[1], adopted);
    assert.equal(scoped.sheets.includes(docSheet), false);
  });

  it('includes document.adoptedStyleSheets with document.styleSheets', () => {
    const linked = sheet([styleRule('.target', { width: '50%' })]);
    const adopted = sheet([styleRule('.target', { width: '2rem' })]);
    const doc = {
      styleSheets: [linked],
      adoptedStyleSheets: [adopted],
    };
    const scoped = collectScopedSheets({ getRootNode: () => doc });
    assert.deepEqual(scoped.sheets, [linked, adopted]);
  });

  it('marks unknown roots inaccessible instead of guessing document sheets', () => {
    const scoped = collectScopedSheets({ getRootNode: () => ({}) });
    assert.equal(scoped.inaccessible, true);
    assert.equal(scoped.sheets.length, 0);
  });
});
