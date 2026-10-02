export function isViewportPageElement(el: Element): boolean {
  if (el.closest('[id^="dm-"], .dm-multi-overlay, .dm-comment-pin, .dm-comment-region')) return false;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0 || r.bottom <= 0 || r.top >= window.innerHeight || r.right <= 0 || r.left >= window.innerWidth) return false;
  const style = getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse';
}
