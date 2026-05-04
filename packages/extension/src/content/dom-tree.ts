// ============================================================
// Design Mode — DOM Tree Builder
// ============================================================

import { getOrAssignId } from './helpers';

export interface DomNode {
  id: string; tagName: string; displayName: string;
  depth: number; childCount: number; isVisible: boolean; hasText: boolean;
  parentId: string | null;
}

const SKIP_TAGS = new Set(['SCRIPT','STYLE','LINK','NOSCRIPT','META','HEAD']);
const DM_IDS = new Set(['dm-hover','dm-select','dm-dim-label','dm-panel','dm-toolbar']);

export function buildDomTree(root: HTMLElement = document.body): DomNode[] {
  const tree: DomNode[] = [];
  function walk(node: HTMLElement, depth: number, parentId: string | null) {
    if (SKIP_TAGS.has(node.tagName)) return;
    if (DM_IDS.has(node.id)) return;
    if (node.id?.startsWith('dm-')) return;
    if (node.classList?.contains('dm-comment-pin')) return;

    const id = getOrAssignId(node);
    let name = node.tagName.toLowerCase();
    if (node.id) name += `#${node.id}`;
    else if (node.className && typeof node.className === 'string') {
      const c = node.className.trim().split(/\s+/)[0];
      if (c) name += `.${c}`;
    }
    const cs = window.getComputedStyle(node);
    tree.push({
      id, tagName: node.tagName.toLowerCase(), displayName: name, depth,
      childCount: node.children.length,
      isVisible: cs.display !== 'none' && cs.visibility !== 'hidden',
      hasText: (node.textContent?.trim().length || 0) > 0,
      parentId,
    });
    for (const child of Array.from(node.children) as HTMLElement[]) walk(child, depth + 1, id);
  }
  walk(root, 0, null);
  return tree;
}
