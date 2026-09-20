import { getElementById } from './helpers';
import { getComponentHierarchy, getSourceLocation } from './source-detection';
import type { ComponentContext } from '../component-group';

export function getChangeComponentContexts(changes: Array<{ elementId?: string; selector?: string }>): Record<string, ComponentContext> {
  const contexts: Record<string, ComponentContext> = Object.create(null);
  for (const change of changes) {
    const key = change.elementId || change.selector;
    if (!key || Object.hasOwn(contexts, key)) continue;
    contexts[key] = {};
    const element = change.elementId ? getElementById(change.elementId) : null;
    if (!element) continue;
    const hierarchy = getComponentHierarchy(element);
    const owner = hierarchy[0];
    const source = owner?.source || getSourceLocation(element);
    contexts[key] = {
      name: owner?.name || source?.component,
      file: source?.cleanPath || (source?.file !== 'unknown' ? source?.file : undefined),
    };
  }
  return contexts;
}
