export interface ComponentContext {
  name?: string;
  file?: string;
}

export interface ComponentGroup {
  key: string;
  label: string;
  source: string;
}

export function componentGroup(context: ComponentContext | undefined, elementKey: string, tokens = false): ComponentGroup {
  if (tokens) return { key: 'tokens', label: 'Design tokens', source: '' };
  const name = context?.name?.trim();
  const file = context?.file?.trim();
  if (file && file !== 'unknown') {
    return { key: JSON.stringify(['source', file, name || '']), label: name || file, source: file };
  }
  // A display name alone cannot distinguish unrelated source components.
  if (name) return { key: JSON.stringify(['unverified', elementKey]), label: name, source: 'Source unverified' };
  return { key: 'unknown', label: 'Unattributed elements', source: '' };
}

export function groupByComponent<T>(items: T[], identify: (item: T) => ComponentGroup): Array<ComponentGroup & { items: T[] }> {
  const groups = new Map<string, ComponentGroup & { items: T[] }>();
  for (const item of items) {
    const identity = identify(item);
    let group = groups.get(identity.key);
    if (!group) {
      group = { ...identity, items: [] };
      groups.set(identity.key, group);
    }
    group.items.push(item);
  }
  return [...groups.values()];
}
