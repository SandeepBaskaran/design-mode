import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bandsFromSnapshot,
  isFlexOrGridDisplay,
  splitTrackList,
  trackSizesPx,
} from './computed-layout-overlay.ts';

describe('isFlexOrGridDisplay', () => {
  it('accepts flex and grid including inline', () => {
    assert.equal(isFlexOrGridDisplay('flex'), true);
    assert.equal(isFlexOrGridDisplay('inline-grid'), true);
    assert.equal(isFlexOrGridDisplay('block'), false);
  });
});

describe('track parsing', () => {
  it('splits tracks without breaking minmax()', () => {
    assert.deepEqual(splitTrackList('200px minmax(0px, 1fr) 80px'), ['200px', 'minmax(0px, 1fr)', '80px']);
  });
  it('sizes px and fr tracks against the container', () => {
    assert.deepEqual(trackSizesPx(['100px', '1fr', '1fr'], 300, 0), [100, 100, 100]);
    assert.deepEqual(trackSizesPx(['100px', '100px'], 300, 20), [100, 100]);
  });
});

describe('bandsFromSnapshot', () => {
  it('returns nothing for non-flex/grid', () => {
    assert.deepEqual(bandsFromSnapshot({ display: 'block', width: 100, height: 40 }), []);
  });
  it('paints grid columns and rows from computed px tracks', () => {
    const bands = bandsFromSnapshot({
      display: 'grid',
      gridTemplateColumns: '100px 50px',
      gridTemplateRows: '20px',
      columnGap: '10px',
      rowGap: '0px',
      width: 160,
      height: 20,
    });
    const cols = bands.filter((b) => b.kind === 'col');
    assert.equal(cols.length, 2);
    assert.equal(cols[0].x, 0);
    assert.equal(cols[0].w, 100);
    assert.equal(cols[1].x, 110);
    assert.equal(cols[1].w, 50);
    const rows = bands.filter((b) => b.kind === 'row');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].h, 20);
  });
  it('adds item bands from child boxes for flex containers', () => {
    const bands = bandsFromSnapshot(
      { display: 'flex', width: 200, height: 40 },
      [{ left: 0, top: 0, width: 80, height: 40 }, { left: 90, top: 0, width: 80, height: 40 }],
    );
    const items = bands.filter((b) => b.kind === 'item');
    assert.equal(items.length, 2);
    assert.equal(items[1].x, 90);
  });
});
