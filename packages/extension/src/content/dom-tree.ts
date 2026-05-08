// ============================================================
// Design Mode — DOM Tree Builder
// ============================================================

import { getOrAssignId } from './helpers';
import { getComponentHierarchy } from './source-detection';

export interface DomNode {
  id: string; tagName: string; displayName: string;
  depth: number; childCount: number; isVisible: boolean; hasText: boolean;
  parentId: string | null;
  // Optional enriched metadata. Each is omitted when not set / not interesting.
  zIndex?: string;             // raw z-index value when not 'auto'
  backgroundColor?: string;    // rgba string when non-transparent
  componentName?: string;      // React / Vue / etc. component name when source detection finds one
  // Tree-extension flags. The default tree only has DOM elements; these
  // mark virtual children added for shadow trees, iframes, and CSS
  // pseudo-elements so the renderer can badge them.
  containerKind?: 'shadow' | 'iframe' | 'pseudo';
}

const SKIP_TAGS = new Set(['SCRIPT','STYLE','LINK','NOSCRIPT','META','HEAD']);
const DM_IDS = new Set(['dm-hover','dm-select','dm-dim-label','dm-panel','dm-toolbar']);

// CSS `content` is `'normal'` (or `'none'`) on every pseudo-element by
// default. Anything else means the author placed visible content there.
function pseudoHasContent(el: Element, pseudo: '::before' | '::after'): boolean {
  try {
    const c = window.getComputedStyle(el, pseudo).getPropertyValue('content');
    return !!c && c !== 'none' && c !== 'normal' && c !== '""' && c !== "''";
  } catch { return false; }
}

export function buildDomTree(root: HTMLElement = document.body): DomNode[] {
  const tree: DomNode[] = [];

  function visit(node: HTMLElement, depth: number, parentId: string | null) {
    if (SKIP_TAGS.has(node.tagName)) return;
    if (DM_IDS.has(node.id)) return;
    if (node.id?.startsWith('dm-')) return;
    if (node.classList?.contains('dm-comment-pin')) return;

    const id = getOrAssignId(node);
    let name = node.tagName.toLowerCase();
    if (node.id) name += `#${node.id}`;
    else if (node.className && typeof node.className === 'string') {
      // Prefer the first non-marker class for the layer label so duplicates
      // still show their original class (e.g. `.card-1`) instead of the
      // synthetic `.dm-clone-dm-3`. The "(copy)" suffix below makes the
      // duplicate identity explicit.
      const cls = node.className.trim().split(/\s+/).filter(c => !c.startsWith('dm-clone'));
      const c = cls[0];
      if (c) name += `.${c}`;
    }
    // Suffix duplicates / pastes so the Layers tab makes the
    // original-vs-copy distinction obvious at a glance.
    if (node.classList?.contains('dm-clone')) name += ' (copy)';
    const cs = window.getComputedStyle(node);

    // Enrichment 1 — z-index when non-default. The renderer surfaces this
    // as a small chip so stacking context is visible at a glance.
    const z = (cs.zIndex || 'auto').trim();
    const zIndex = z !== 'auto' && z !== '' && z !== '0' ? z : undefined;

    // Enrichment 2 — background-color when non-transparent. The renderer
    // shows a tiny colour swatch next to the name.
    const bg = (cs.backgroundColor || '').replace(/\s+/g, '');
    const backgroundColor = bg && bg !== 'rgba(0,0,0,0)' && bg !== 'transparent' ? cs.backgroundColor : undefined;

    // Enrichment 3 — component detection (React / Vue / etc.). The fiber
    // walk is fast (returns the first 15 components) but we still cap
    // depth: only run the walk for components actually authored in user
    // code (skip body / html / common wrappers) so the tree-build stays
    // snappy on large pages.
    let componentName: string | undefined;
    try {
      const tag = node.tagName;
      if (tag !== 'HTML' && tag !== 'BODY') {
        const hierarchy = getComponentHierarchy(node);
        if (hierarchy.length > 0) componentName = hierarchy[0].name;
      }
    } catch { /* never break tree-build on source detection errors */ }

    // Children to walk. The tree extends past the regular DOM tree:
    //   • Open shadow roots → walked as siblings of the host's normal children.
    //   • Same-origin iframes → walked as siblings, prefixed with their own iframe node.
    //   • CSS ::before / ::after → virtual children when their `content` is set.
    const childCount = node.children.length +
      (node.shadowRoot ? 1 : 0) +
      (node.tagName === 'IFRAME' ? 1 : 0) +
      (pseudoHasContent(node, '::before') ? 1 : 0) +
      (pseudoHasContent(node, '::after') ? 1 : 0);

    tree.push({
      id,
      tagName: node.tagName.toLowerCase(),
      displayName: name,
      depth,
      childCount,
      isVisible: cs.display !== 'none' && cs.visibility !== 'hidden',
      hasText: (node.textContent?.trim().length || 0) > 0,
      parentId,
      zIndex,
      backgroundColor,
      componentName,
    });

    // ::before is rendered as the first virtual child so it sits visually
    // ahead of real children (matching paint order).
    if (pseudoHasContent(node, '::before')) {
      tree.push({
        id: id + '::before',
        tagName: '::before',
        displayName: '::before',
        depth: depth + 1,
        childCount: 0,
        isVisible: cs.display !== 'none' && cs.visibility !== 'hidden',
        hasText: false,
        parentId: id,
        containerKind: 'pseudo',
      });
    }

    // Open shadow roots — walked recursively. Children of the shadow root
    // are tagged with the host as their parent so the indentation reads
    // naturally and they're tagged with `containerKind:'shadow'`.
    if (node.shadowRoot) {
      // Single virtual marker so the user sees "this element has a shadow".
      const shadowId = id + '::shadow';
      tree.push({
        id: shadowId,
        tagName: '#shadow-root',
        displayName: '#shadow-root',
        depth: depth + 1,
        childCount: node.shadowRoot.children.length,
        isVisible: true,
        hasText: false,
        parentId: id,
        containerKind: 'shadow',
      });
      for (const child of Array.from(node.shadowRoot.children) as HTMLElement[]) {
        visit(child, depth + 2, shadowId);
      }
    }

    // Same-origin iframes — try to walk into the contentDocument. Cross-
    // origin iframes throw a SecurityError; that's caught and the iframe
    // node stays a leaf in the tree.
    if (node.tagName === 'IFRAME') {
      try {
        const doc = (node as HTMLIFrameElement).contentDocument;
        if (doc && doc.body) {
          for (const child of Array.from(doc.body.children) as HTMLElement[]) {
            visit(child, depth + 1, id);
          }
        }
      } catch { /* cross-origin iframe — opaque by spec */ }
    }

    // Regular children, then ::after at the end (matches paint order).
    for (const child of Array.from(node.children) as HTMLElement[]) {
      visit(child, depth + 1, id);
    }
    if (pseudoHasContent(node, '::after')) {
      tree.push({
        id: id + '::after',
        tagName: '::after',
        displayName: '::after',
        depth: depth + 1,
        childCount: 0,
        isVisible: cs.display !== 'none' && cs.visibility !== 'hidden',
        hasText: false,
        parentId: id,
        containerKind: 'pseudo',
      });
    }
  }

  visit(root, 0, null);
  return tree;
}
