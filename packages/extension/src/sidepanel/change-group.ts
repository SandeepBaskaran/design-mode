type GroupedChange = {
  id?: string;
  elementId?: string;
  selector?: string;
  action?: string;
};

export function changeGroupKey(change: GroupedChange): string {
  return change.elementId || change.selector || 'unknown';
}

export function collectGroupRevertIds(
  groupKey: string,
  changes: {
    styles: GroupedChange[];
    texts: GroupedChange[];
    dom: GroupedChange[];
    comments: GroupedChange[];
  },
): string[] {
  const inGroup = (change: GroupedChange) => changeGroupKey(change) === groupKey;
  const styleIds = changes.styles
    .map((change, index) => ({ change, index }))
    .filter(({ change }) => inGroup(change))
    .map(({ change, index }) => change.id || 'style-' + index);
  const textIds = changes.texts.filter(inGroup).flatMap(change => change.id ? [change.id] : []);
  const domIds = changes.dom.filter(inGroup).map(change => change.id || 'dom-' + change.action);
  const commentIds = changes.comments.filter(inGroup).flatMap(change => change.id ? ['comment-' + change.id] : []);
  return [...styleIds, ...textIds, ...domIds, ...commentIds];
}
