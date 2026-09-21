import { z } from 'zod';
import type { StyleChange, TextChange, DomChange } from './change-tracker';
import type { CommentData } from './comments';
import { isSafeRichTextHref } from '../rich-text-preservation';

// One boundary for file imports and saved-session replay. Parse into fresh,
// bounded records before touching storage, trackers, history or the live DOM.
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const IMPORT_STATES = ['', ':hover', ':active', ':focus', ':focus-visible', ':focus-within', ':disabled', ':checked', '@starting'] as const;
const str = z.string().max(100_000);
const isElementId = (value: string) => /^dm-\d+$/.test(value) && Number.isSafeInteger(Number(value.slice(3))) && Number(value.slice(3)) < Number.MAX_SAFE_INTEGER;
const id = z.string().max(80).refine(isElementId, 'Invalid element ID');
const number = z.number().finite();
const selector = z.string().min(1).max(4096).refine(value => {
  try { document.createDocumentFragment().querySelector(value); return true; } catch { return false; }
}, 'Invalid selector');
const base = {
  id: z.string().min(1).max(200), elementId: id, selector,
  label: str.optional(), timestamp: number.nonnegative(),
  status: z.enum(['todo', 'in_progress', 'resolved']).optional(),
  viewportWidth: number.nonnegative().optional(),
  breakpoint: z.enum(['mobile', 'tablet', 'desktop']).optional(),
};
const loc = z.object({ parentSelector: selector, parentId: id.optional(), index: number.int().nonnegative().max(1_000_000) });
const style = z.object({ ...base,
  property: z.string().max(200).regex(/^(?:--[\w-]+|-?[a-zA-Z][\w-]*|__effect_overlay)$/),
  oldValue: str, newValue: str, state: z.enum(IMPORT_STATES).optional(),
  groupId: str.optional(), groupLabel: str.optional(),
  groupKind: z.enum(['preset', 'multi-select', 'visibility', 'consolidate']).optional(),
});
const text = z.object({ ...base, oldText: str, newText: str,
  isHtml: z.boolean().optional(), attributeName: z.literal('href').optional(),
});
const dom = z.object({ ...base,
  action: z.enum(['delete', 'duplicate', 'move', 'insert']),
  tagName: z.string().regex(/^[a-zA-Z][\w-]*$/).max(100),
  outerHTML: str.optional(), destination: loc.optional(), origin: loc.optional(),
});
const comment = z.object({
  id: z.string().min(1).max(200), elementId: id.or(z.literal('')), selector: selector.or(z.literal('')),
  text: str, timestamp: number.nonnegative(), updatedAt: number.nonnegative(), pageUrl: str,
  resolved: z.boolean().optional(),
  pinOffset: z.object({ x: number, y: number }).optional(),
  region: z.object({ x: number, y: number, w: number.nonnegative(), h: number.nonnegative() }).optional(),
}).refine(c => Boolean(c.region) || Boolean(c.elementId && c.selector), 'Missing comment anchor');
const schema = z.object({
  styleChanges: z.array(style).max(5000), textChanges: z.array(text).max(5000),
  domChanges: z.array(dom).max(5000), comments: z.array(comment).max(5000).optional().default([]),
});

// Reject active markup rather than silently stripping page structures. Unlike
// the panel's rich-text sanitizer this preserves classes, layout, images, tables
// and static SVG, and never turns opaque placeholders back into raw HTML.
// Templates are inert while inspected; no imported node is connected here.
const htmlTags = new Set(('a abbr address area article aside audio b bdi bdo blockquote br button canvas caption cite code col colgroup data datalist dd del details dfn dialog div dl dt em fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr i img input ins kbd label legend li main map mark menu meter nav ol optgroup option output p picture pre progress q rp rt ruby s samp search section select slot small source span strong sub summary sup table tbody td textarea tfoot th thead time tr track u ul var video wbr').split(' '));
const svgTags = new Set(('svg g defs symbol use path rect circle ellipse line polyline polygon text tspan textPath title desc clipPath mask pattern marker linearGradient radialGradient stop filter feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence').split(' '));
function safeUrl(value: string): boolean {
  const normalized = value.replace(/[\u0000-\u0020\u007f]/g, '');
  return !/^[a-z][a-z\d+.-]*:/i.test(normalized)
    || /^(?:https?:|mailto:|tel:)/i.test(normalized)
    || /^data:image\/(?:png|gif|jpeg|webp|avif);base64,[a-z\d+/=]*$/i.test(normalized);
}
export function assertPassiveHtml(html: string, outer = false): void {
  const template = document.createElement('template');
  template.innerHTML = html;
  if (outer && (template.content.children.length !== 1 || Array.from(template.content.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()))) throw Error('Imported outerHTML must have one root element');
  for (const el of template.content.querySelectorAll('*')) {
    const allowed = el.namespaceURI === 'http://www.w3.org/1999/xhtml' ? htmlTags.has(el.localName)
      : el.namespaceURI === 'http://www.w3.org/2000/svg' && svgTags.has(el.localName);
    if (!allowed) throw Error(`Import contains active or unsupported HTML: ${el.localName}`);
    for (const attr of el.attributes) {
      const name = attr.name.toLowerCase();
      if (/^on/.test(name) || ['srcdoc', 'is', 'autofocus'].includes(name)) throw Error(`Import contains active attribute: ${name}`);
      if (['href', 'xlink:href', 'src', 'action', 'formaction', 'poster', 'background', 'data'].includes(name) && !safeUrl(attr.value)) throw Error('Import contains unsafe URL');
      if (name === 'srcset' && attr.value.split(',').some(part => !safeUrl(part.trim().split(/\s+/)[0]))) throw Error('Import contains unsafe srcset');
      if (name === 'data-dm-id' && !isElementId(attr.value)) throw Error('Import contains invalid element identity');
      // Imported CSS stays declaration-only; style/link elements are disallowed.
      if (name === 'style' && /(?:expression\s*\(|-moz-binding|javascript\s*:)/i.test(attr.value)) throw Error('Import contains active CSS');
    }
  }
}

export interface ValidatedImport {
  styleChanges: StyleChange[]; textChanges: TextChange[]; domChanges: DomChange[]; comments: CommentData[];
}
export function validateImportPayload(input: unknown): ValidatedImport {
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > MAX_IMPORT_BYTES) throw Error('Import exceeds 5 MiB limit');
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw Error(`Invalid import at ${issue.path.join('.') || 'payload'}: ${issue.message}`);
  }
  const result = parsed.data;
  const ids = new Set<string>();
  for (const record of [...result.styleChanges, ...result.textChanges, ...result.domChanges, ...result.comments]) {
    if (ids.has(record.id)) throw Error('Duplicate change ID');
    ids.add(record.id);
  }
  for (const c of result.textChanges) {
    if (c.isHtml && c.attributeName) throw Error('HTML and attribute edits cannot be combined');
    if (c.isHtml) { assertPassiveHtml(c.oldText); assertPassiveHtml(c.newText); }
    if (c.attributeName && ((!isSafeRichTextHref(c.oldText) && c.oldText) || (!isSafeRichTextHref(c.newText) && c.newText))) throw Error('Import contains unsafe href');
  }
  for (const c of result.domChanges) if (c.outerHTML) assertPassiveHtml(c.outerHTML, true);
  for (const c of result.styleChanges) {
    if (c.property === '__effect_overlay' && c.newValue && c.newValue !== 'none') {
      const overlay = z.array(z.object({ kind: z.enum(['noise', 'texture']), visible: z.boolean().optional(),
        mode: z.enum(['mono', 'duo', 'multi']).optional(), sizeX: number, sizeY: number,
        density: number.optional(), color1: str.optional(), color2: str.optional(),
        color1Opacity: number.optional(), color2Opacity: number.optional(), opacity: number.optional(),
        radius: number.optional(), clipToShape: z.boolean().optional(),
      })).max(100);
      overlay.parse(JSON.parse(c.newValue));
    }
  }
  return result;
}
