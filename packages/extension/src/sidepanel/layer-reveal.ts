export interface LayerParentLink { id: string; parentId: string | null }

export function collapsedAncestorIds(tree: readonly LayerParentLink[], id: string, collapsed: ReadonlySet<string>): string[] {
  const parents = new Map(tree.map(node => [node.id, node.parentId]));
  const hidden: string[] = [];
  const seen = new Set<string>();
  let parent = parents.get(id) ?? null;
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    if (collapsed.has(parent)) hidden.push(parent);
    parent = parents.get(parent) ?? null;
  }
  return hidden;
}

// The sticky search/filter header covers the top of the scroller, so a row
// scrolled "to the top edge" would sit underneath it.
export function layerScrollDelta(row: { top: number; bottom: number }, view: { top: number; bottom: number }, stickyHeight: number): number {
  const visibleTop = view.top + stickyHeight;
  if (row.top >= visibleTop && row.bottom <= view.bottom) return 0;
  const spare = Math.max(0, view.bottom - visibleTop - (row.bottom - row.top));
  return row.top - visibleTop - spare / 2;
}
