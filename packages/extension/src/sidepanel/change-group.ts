type GroupedChange = {
  id?: string;
  elementId?: string;
  selector?: string;
  action?: string;
  groupKind?: string;
  groupId?: string;
};

export function changeGroupKey(change: GroupedChange): string {
  return change.elementId || change.selector || 'unknown';
}

export function styleChangeGroupKey(change: GroupedChange, grouping: 'element' | 'component' = 'element'): string {
  return grouping === 'element' && change.groupId &&
    (change.groupKind === 'multi-select' || change.groupKind === 'consolidate')
    ? change.groupKind + ':' + change.groupId : changeGroupKey(change);
}

export function collectGroupRevertIds(
  groupKey: string,
  changes: {
    styles: GroupedChange[];
    texts: GroupedChange[];
    dom: GroupedChange[];
    comments: GroupedChange[];
  },
  grouping: 'element' | 'component' = 'element',
): string[] {
  const inGroup = (change: GroupedChange) => changeGroupKey(change) === groupKey;
  const styleIds = changes.styles
    .map((change, index) => ({ change, index }))
    .filter(({ change }) => styleChangeGroupKey(change, grouping) === groupKey)
    .map(({ change, index }) => change.id || 'style-' + index);
  const textIds = changes.texts.filter(inGroup).flatMap(change => change.id ? [change.id] : []);
  const domIds = changes.dom.filter(inGroup).map(change => change.id || 'dom-' + change.action);
  const commentIds = changes.comments.filter(inGroup).flatMap(change => change.id ? ['comment-' + change.id] : []);
  return [...styleIds, ...textIds, ...domIds, ...commentIds];
}
