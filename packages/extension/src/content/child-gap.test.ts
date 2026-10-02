import assert from 'node:assert/strict';
import test from 'node:test';
import { measureChildGap } from './child-gap';

function fixture(rects: { left: number; top: number; width: number; height: number }[]) {
  let reads = 0;
  const el = {
    childElementCount: rects.length,
    children: rects.map(r => ({ id: '', getBoundingClientRect() {
      reads++;
      return { ...r, right: r.left + r.width, bottom: r.top + r.height };
    } })),
  } as unknown as HTMLElement;
  return { el, reads: () => reads };
}

test('gap measurement is exact for aligned grid rows', () => {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { getComputedStyle: () => ({ display: 'grid' }) } });
  try {
    const f = fixture([{left:0,top:0,width:40,height:30},{left:150,top:0,width:40,height:30},{left:0,top:50,width:40,height:30},{left:150,top:50,width:40,height:30}]);
    assert.deepEqual(measureChildGap(f.el), {col:110,row:20});
  } finally { if (old) Object.defineProperty(globalThis, 'window', old); else Reflect.deleteProperty(globalThis, 'window'); }
});

test('large containers return unknown before reading child geometry', () => {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { getComputedStyle: () => ({ display: 'grid' }) } });
  try {
    const f = fixture(Array.from({length:10000}, (_,i) => ({left:i*20,top:0,width:10,height:10})));
    assert.deepEqual(measureChildGap(f.el), {col:null,row:null});
    assert.equal(f.reads(), 0);
  } finally { if (old) Object.defineProperty(globalThis, 'window', old); else Reflect.deleteProperty(globalThis, 'window'); }
});
