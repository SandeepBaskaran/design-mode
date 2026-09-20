interface ParentLinked<T> {
  parentElement: T | null;
}

export function orderDomDeletionTargets<T extends ParentLinked<T>>(
  ids: string[],
  resolve: (id: string) => T | null,
  compareAtSameDepth: (a: T, b: T) => number = () => 0,
): Array<{ id: string; element: T }> {
  const depth = (element: T) => {
    let value = 0;
    for (let parent = element.parentElement; parent; parent = parent.parentElement) value++;
    return value;
  };

  return [...new Set(ids)]
    .map(id => ({ id, element: resolve(id) }))
    .filter((target): target is { id: string; element: T } => Boolean(target.element))
    .sort((a, b) => depth(b.element) - depth(a.element) || compareAtSameDepth(a.element, b.element));
}
