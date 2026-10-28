// ============================================================
// MAIN-world React fiber source reader for elements DIVE
// tagged. Values come from the page world and are untrusted until
// sanitizeFiberSource validates them at the background boundary.
// ============================================================

// executeScript serialises this function; keep its runtime dependencies local.
export function readPageFiberSources(elementIds: string[]): Record<string, unknown> {
  const sources: Record<string, unknown> = Object.create(null);
  for (const id of elementIds.slice(0, 50)) {
    try {
      const element = document.querySelector(`[data-dm-id="${CSS.escape(id)}"]`);
      if (!element) continue;
      const key = Object.keys(element).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
      let fiber = key ? (element as any)[key] : null;
      const visited = new Set<unknown>();
      let nearestNamed: string | null = null;
      for (let depth = 0; fiber && depth < 50 && !visited.has(fiber); depth++, fiber = fiber.return) {
        visited.add(fiber);
        const type = fiber.type;
        const named = type && typeof type !== 'string'
          ? text(type.displayName) || text(type.name) || text(type.render?.displayName) || text(type.render?.name)
          : null;
        nearestNamed = named || nearestNamed;
        // _debugSource shadows type.__source: both report the JSX site, React's
        // own record is the precise one. Lines pass through verbatim — they are
        // bundler-intermediate positions; authored-position refinement happens
        // later at resolveSourceLocation via the module's source map.
        const source = fiber._debugSource ?? (type && typeof type !== 'string' ? type.__source : null);
        if (source && typeof source.fileName === 'string') {
          sources[id] = {
            file: source.fileName,
            line: source.lineNumber,
            ...(source.columnNumber != null ? { column: source.columnNumber } : {}),
            ...(named || nearestNamed ? { component: named || nearestNamed } : {}),
          };
          break;
        }
      }
    } catch {
      // Framework metadata is optional and may be implemented by page getters.
    }
  }
  return sources;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 500) : undefined;
}

// Boundary validation for payloads that crossed the MAIN→isolated world hop.
export function sanitizeFiberSource(raw: unknown): { file: string; line: number; column?: number; component?: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.file !== 'string' || !obj.file || obj.file.length > 500) return null;
  if (typeof obj.line !== 'number' || !Number.isSafeInteger(obj.line) || obj.line < 0) return null;
  if (obj.column != null && (typeof obj.column !== 'number' || !Number.isSafeInteger(obj.column) || obj.column < 0)) return null;
  if (obj.component != null && (typeof obj.component !== 'string' || !obj.component || obj.component.length > 200)) return null;
  return {
    file: obj.file,
    line: obj.line,
    ...(obj.column != null ? { column: obj.column } : {}),
    ...(obj.component != null ? { component: obj.component } : {}),
  };
}
