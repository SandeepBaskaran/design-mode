// Lucide icon swaps copy path markup from another icon already on the page.
// FontAwesome stays display-only — swapping a class without the matching
// glyph/SVG would lie about the result.

export function lucideIconClass(nameOrClass: string): string {
  const trimmed = (nameOrClass || '').trim();
  if (!trimmed) return '';
  return trimmed.startsWith('lucide-') ? trimmed : 'lucide-' + trimmed;
}

export function swapLucideClasses(className: string, nextIconClass: string): string {
  const next = lucideIconClass(nextIconClass);
  const parts = className.trim().split(/\s+/).filter(Boolean);
  const kept = parts.filter(c => !(c.startsWith('lucide-') && c !== 'lucide'));
  if (next && !kept.includes(next)) kept.push(next);
  if (!kept.includes('lucide')) kept.unshift('lucide');
  return kept.join(' ');
}

export type LucideGlyph = { classNames: string[]; innerHTML: string; viewBox: string | null };

export function findLucideGlyph(glyphs: LucideGlyph[], iconClass: string): LucideGlyph | undefined {
  const want = lucideIconClass(iconClass);
  if (!want) return undefined;
  return glyphs.find(g => g.classNames.includes(want));
}
