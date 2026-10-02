export function measureChildGap(el: HTMLElement): { col: number | null; row: number | null } {
  // Large containers must not stall inspection; a sampled minimum would be misleading.
  if (el.childElementCount > 200) return { col: null, row: null };
  if (!/flex|grid/.test(window.getComputedStyle(el).display)) return { col: null, row: null };
  const kids = (Array.from(el.children) as HTMLElement[]).filter(
    (c) => !(c.id && c.id.startsWith('dm-')),
  );
  const rects = kids.map(k => k.getBoundingClientRect()).filter(r => r.width > 0 || r.height > 0);
  if (rects.length < 2) return { col: null, row: null };
  const gap = (axis: 'col' | 'row'): number | null => {
    let closest = Infinity;
    for (const a of rects) for (const b of rects) {
      if (a === b) continue;
      const overlap = axis === 'col'
        ? Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        : Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const distance = axis === 'col' ? b.left - a.right : b.top - a.bottom;
      if (overlap > 0 && distance >= 0) closest = Math.min(closest, distance);
    }
    return Number.isFinite(closest) ? Math.round(closest * 10) / 10 : null;
  };
  return { col: gap('col'), row: gap('row') };
}
