import type { ComponentContext } from '../component-group';

// executeScript serialises this function; keep its runtime dependencies local.
export function readPageComponentContexts(elementIds: string[]): Record<string, ComponentContext> {
  const contexts: Record<string, ComponentContext> = Object.create(null);
  const text = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim().slice(0, 500) : undefined;
  for (const id of elementIds.slice(0, 500)) {
    try {
      const element = document.querySelector(`[data-dm-id="${CSS.escape(id)}"]`);
      if (!element) continue;
      const key = Object.keys(element).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
      let fiber = key ? (element as any)[key] : null;
      const visited = new Set<unknown>();
      for (let depth = 0; fiber && depth < 50 && !visited.has(fiber); depth++, fiber = fiber.return) {
        visited.add(fiber);
        const type = fiber.type;
        if (!type || typeof type === 'string') continue;
        const name = text(type.displayName) || text(type.name) || text(type.render?.displayName) || text(type.render?.name);
        if (!name) continue;
        contexts[id] = { name, file: text(fiber._debugSource?.fileName) || text(type.__source?.fileName) };
        break;
      }
      if (contexts[id]) continue;
      // Vue attaches the owning instance to host elements, not just its root.
      const vue = (element as any).__vueParentComponent || (element as any).__vue__;
      const type = vue?.type || vue?.$options;
      const name = text(type?.name) || text(type?.__name);
      const file = text(type?.__file);
      if (name || file) contexts[id] = { name, file };
    } catch {
      // Framework metadata is optional and may be implemented by page getters.
    }
  }
  return contexts;
}
