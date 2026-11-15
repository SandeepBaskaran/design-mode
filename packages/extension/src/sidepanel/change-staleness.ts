export function changeGroupIsStale(
  group: { elementId: string; items: { type: string; region?: unknown; pageUrl?: string }[] },
  liveElementIds: ReadonlySet<string>,
  domTreeLoaded: boolean,
  activeRoute?: string,
): boolean {
  if (group.elementId) return domTreeLoaded && !liveElementIds.has(group.elementId);
  const notes = group.items.filter(item => item.type === 'comment' && item.region);
  if (notes.length === 0 || notes.length !== group.items.length) return true;
  if (activeRoute && notes.some(note => note.pageUrl && note.pageUrl !== activeRoute)) return true;
  return false;
}
