// Tiny per-session store for user edits to :root CSS variables.
// Lives in its own file so both the content message handlers and the
// markdown exporter can import it without a circular dependency on
// content/index.ts.

const rootVarOriginals = new Map<string, string>();

export function captureOriginalIfNew(cssVar: string): void {
  if (rootVarOriginals.has(cssVar)) return;
  rootVarOriginals.set(
    cssVar,
    getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim(),
  );
}

export function clearRootVarEdit(cssVar: string): void {
  rootVarOriginals.delete(cssVar);
}

// Returns one entry per :root variable the user has edited, with the
// original value (captured the first time they touched it) and the
// current value the page is resolving to. Tokens whose current value
// equals the original (e.g. reverted) are omitted.
export function getRootVarEdits(): Array<{ cssVar: string; original: string; current: string }> {
  const out: Array<{ cssVar: string; original: string; current: string }> = [];
  for (const [cssVar, original] of rootVarOriginals) {
    const current = document.documentElement.style.getPropertyValue(cssVar).trim() ||
      getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
    if (current && current !== original) {
      out.push({ cssVar, original, current });
    }
  }
  return out;
}
