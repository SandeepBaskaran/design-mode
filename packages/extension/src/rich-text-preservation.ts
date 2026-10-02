export interface RichTextNodeLike {
  tagName: string;
  textContent: string | null;
  attributes: Iterable<{ name: string }>;
  children: Iterable<RichTextNodeLike>;
}

const EDITABLE_TAGS = new Set([
  'B', 'I', 'U', 'S', 'STRIKE', 'STRONG', 'EM', 'A', 'BR', 'P', 'SPAN', 'UL', 'OL', 'LI',
  'CODE', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE',
  'SMALL', 'MARK', 'SUB', 'SUP',
]);

const MEDIA_TAGS = new Set([
  'IMG', 'SVG', 'PICTURE', 'VIDEO', 'AUDIO', 'CANVAS', 'IFRAME', 'OBJECT', 'EMBED',
]);

const EDITABLE_ATTRIBUTES: Record<string, ReadonlySet<string>> = {
  A: new Set(['href', 'target', 'rel']),
};
const EMPTY_ATTRIBUTES = new Set<string>();

export const RICH_TEXT_PRESERVED_NODE_ATTR = 'data-dm-preserve-node';
export const RICH_TEXT_STRUCTURE_NODE_ATTR = 'data-dm-rich-node';
export const RICH_TEXT_LINK_NODE_ATTR = 'data-dm-rich-link';

export function shouldCommitRichTextKey(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'isComposing'>): boolean {
  return event.key === 'Enter' && !event.shiftKey && !event.isComposing;
}

function preservedNodeLabel(tagName: string): string {
  const labels: Record<string, string> = {
    IMG: 'Image', SVG: 'SVG', PICTURE: 'Picture', VIDEO: 'Video', AUDIO: 'Audio',
    CANVAS: 'Canvas', IFRAME: 'Embed', OBJECT: 'Object', EMBED: 'Embed',
    SPAN: 'Span media', I: 'Icon',
  };
  return labels[tagName.toUpperCase()] ?? `${tagName.toLowerCase()} media`;
}

export function editableRichTextAttributes(tagName: string): ReadonlySet<string> {
  return EDITABLE_ATTRIBUTES[tagName.toUpperCase()] ?? EMPTY_ATTRIBUTES;
}

export function sanitizeRichTextHref(value: string): string | null {
  const trimmed = value.trim();
  // URL parsing drops controls and treats backslashes as slashes on web pages.
  if (/[\u0000-\u001f\u007f\\]/.test(trimmed)) return null;
  // Return the validated value so callers cannot accidentally use the raw input.
  if (/^https?:\/\//i.test(trimmed)
    || trimmed.startsWith('#')
    || (trimmed.startsWith('/') && !trimmed.startsWith('//'))
    || trimmed.startsWith('.')) {
    try {
      // Keep IPv6 delimiters and existing escapes while encoding URL data.
      return encodeURI(trimmed)
        .replace(/%5B/gi, '[').replace(/%5D/gi, ']')
        .replace(/%25([0-9a-f]{2})/gi, '%$1');
    } catch {
      return null;
    }
  }
  return null;
}

export function normalizeRichTextHref(value: string): string | null {
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return null;
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('//')) return null;
  if (trimmed.startsWith('#') || trimmed.startsWith('/') || trimmed.startsWith('.')) return trimmed;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

export function isSafeRichTextHref(value: string): boolean {
  const href = normalizeRichTextHref(value);
  return href !== null && href !== '';
}

export function sanitizeRichTextHtml(raw: string): string {
  if (!raw) return '';
  const doc = new DOMParser().parseFromString('<body><div id="r">' + raw + '</div></body>', 'text/html');
  const root = doc.getElementById('r');
  if (!root) return '';
  const preservedNodes = collectPreservedRichTextNodes(root);
  const editableNodes = collectEditableRichTextNodes(root);
  const linkNodes = editableNodes.filter(node => node.tagName.toUpperCase() === 'A');
  const walk = (node: Element) => {
    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i] as HTMLElement;
      const preservedIndex = preservedNodes.indexOf(child);
      if (preservedIndex !== -1) {
        const placeholder = doc.createElement('span');
        placeholder.setAttribute(RICH_TEXT_PRESERVED_NODE_ATTR, String(preservedIndex));
        placeholder.contentEditable = 'false';
        placeholder.setAttribute('style', 'display:inline-flex;align-items:center;padding:1px 5px;margin:0 2px;border:1px solid var(--dm-btn-border);border-radius:4px;background:var(--dm-btn-bg);color:var(--dm-text-secondary);font-size:0.85em;line-height:1.4;vertical-align:baseline;user-select:none;');
        placeholder.textContent = `◇ ${preservedNodeLabel(child.tagName)}`;
        node.replaceChild(placeholder, child);
        continue;
      }
      const allowed = editableRichTextAttributes(child.tagName);
      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase();
        if (!allowed.has(name)) {
          child.removeAttribute(attr.name);
        } else if (name === 'href') {
          const href = normalizeRichTextHref(attr.value);
          if (href) child.setAttribute(attr.name, href); else child.removeAttribute(attr.name);
        }
      }
      child.setAttribute(RICH_TEXT_STRUCTURE_NODE_ATTR, String(editableNodes.indexOf(child)));
      if (child.tagName === 'A') child.setAttribute(RICH_TEXT_LINK_NODE_ATTR, String(linkNodes.indexOf(child)));
      walk(child);
    }
  };
  walk(root);
  return root.innerHTML;
}

export function restoreRichTextHtml(root: Element, html: string): string {
  const preservedNodes = collectPreservedRichTextNodes(root);
  const editableNodes = collectEditableRichTextNodes(root);
  const template = document.createElement('template');
  template.innerHTML = html;
  const restoredStructureIndexes = new Set<number>();
  for (const submitted of template.content.querySelectorAll<HTMLElement>(`[${RICH_TEXT_STRUCTURE_NODE_ATTR}]`)) {
    const index = Number(submitted.getAttribute(RICH_TEXT_STRUCTURE_NODE_ATTR));
    const original = Number.isInteger(index) ? editableNodes[index] : undefined;
    submitted.removeAttribute(RICH_TEXT_STRUCTURE_NODE_ATTR);
    if (!original || restoredStructureIndexes.has(index) || original.tagName !== submitted.tagName) continue;
    restoredStructureIndexes.add(index);
    const editableAttributes = editableRichTextAttributes(submitted.tagName);
    for (const attribute of Array.from(original.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('data-dm-') || editableAttributes.has(name)) continue;
      submitted.setAttribute(attribute.name, attribute.value);
    }
  }
  const restoredIndexes = new Set<number>();
  for (const placeholder of template.content.querySelectorAll<HTMLElement>(`[${RICH_TEXT_PRESERVED_NODE_ATTR}]`)) {
    const index = Number(placeholder.getAttribute(RICH_TEXT_PRESERVED_NODE_ATTR));
    const preserved = Number.isInteger(index) ? preservedNodes[index] : undefined;
    if (!preserved || restoredIndexes.has(index)) {
      placeholder.remove();
      continue;
    }
    restoredIndexes.add(index);
    placeholder.replaceWith((preserved as Element).cloneNode(true));
  }
  for (let i = 0; i < preservedNodes.length; i++) {
    if (!restoredIndexes.has(i)) template.content.appendChild((preservedNodes[i] as Element).cloneNode(true));
  }
  for (const link of template.content.querySelectorAll<HTMLAnchorElement>('a')) {
    link.removeAttribute(RICH_TEXT_LINK_NODE_ATTR);
    const href = normalizeRichTextHref(link.getAttribute('href') || '');
    if (href) link.setAttribute('href', href); else link.removeAttribute('href');
  }
  return template.innerHTML;
}

export function replaceRichTextHtml(root: Element, html: string): void {
  const preservedNodes = collectPreservedRichTextNodes(root);
  const template = document.createElement('template');
  template.innerHTML = html;
  for (const replacement of collectPreservedRichTextNodes(template.content)) {
    const index = preservedNodes.findIndex(node => node.outerHTML === replacement.outerHTML);
    if (index === -1) continue;
    // Reuse opaque page-owned islands, not clones that lose listeners and live state.
    replacement.replaceWith(preservedNodes.splice(index, 1)[0]);
  }
  root.replaceChildren(template.content);
}

export function getRichTextLinks(html: string): Array<{ index: number; label: string; href: string }> {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return Array.from(doc.querySelectorAll<HTMLAnchorElement>(`a[${RICH_TEXT_LINK_NODE_ATTR}]`)).flatMap(link => {
    const index = Number(link.getAttribute(RICH_TEXT_LINK_NODE_ATTR));
    if (!Number.isInteger(index)) return [];
    const labelNode = link.cloneNode(true) as HTMLAnchorElement;
    for (const preserved of labelNode.querySelectorAll(`[${RICH_TEXT_PRESERVED_NODE_ATTR}]`)) preserved.remove();
    return [{ index, label: (labelNode.textContent || '').trim() || 'Link', href: link.getAttribute('href') || '' }];
  });
}

export function getRichTextLabel(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  for (const preserved of doc.querySelectorAll(`[${RICH_TEXT_PRESERVED_NODE_ATTR}]`)) preserved.remove();
  return (doc.body.textContent || '').trim();
}

export function shouldPreserveRichTextNode(node: RichTextNodeLike): boolean {
  const tag = node.tagName.toUpperCase();
  if (MEDIA_TAGS.has(tag) || tag.includes('-') || !EDITABLE_TAGS.has(tag)) return true;
  if (tag === 'BR') return false;

  const editableAttributes = editableRichTextAttributes(tag);
  const hasPageOwnedAttributes = Array.from(node.attributes).some((attribute) => {
    const name = attribute.name.toLowerCase();
    return !name.startsWith('data-dm-') && !editableAttributes.has(name);
  });
  if ((tag === 'SPAN' || tag === 'I') && hasPageOwnedAttributes) return true;
  if ((node.textContent || '').trim()) return false;
  return hasPageOwnedAttributes;
}

export function collectPreservedRichTextNodes<T extends RichTextNodeLike>(root: { children: Iterable<T> }): T[] {
  const preserved: T[] = [];
  const visit = (node: { children: Iterable<RichTextNodeLike> }) => {
    for (const child of Array.from(node.children) as T[]) {
      if (shouldPreserveRichTextNode(child)) {
        preserved.push(child);
      } else {
        visit(child);
      }
    }
  };
  visit(root);
  return preserved;
}

export function collectEditableRichTextNodes<T extends RichTextNodeLike>(root: T): T[] {
  const editable: T[] = [];
  const visit = (node: RichTextNodeLike) => {
    for (const child of Array.from(node.children) as T[]) {
      if (shouldPreserveRichTextNode(child)) continue;
      editable.push(child);
      visit(child);
    }
  };
  visit(root);
  return editable;
}
