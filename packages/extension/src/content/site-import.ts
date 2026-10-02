import { z } from 'zod';
import { isSafeRichTextHref } from '../rich-text-preservation';
import type { CommentData } from './comments';
import { routeIdentity, type RouteGroup, type RouteSessionStore } from './route-storage';

export const SITE_IMPORT_LIMITS = { bytes: 5 * 1024 * 1024, routes: 200, entries: 10000 } as const;
const short = z.string().max(8192);
const text = z.string().max(500000);
const finite = z.number().finite();
const elementId = z.string().max(256).regex(/^[\w-]*$/);
const point = z.object({ x: finite, y: finite });
const position = z.object({ parentSelector: short, index: z.number().int().nonnegative(), parentId: elementId.optional() });
const base = {
  id: short.min(1), elementId, selector: short, timestamp: finite.nonnegative(),
  label: short.optional(), status: z.enum(['todo', 'in_progress', 'resolved']).optional(),
  viewportWidth: finite.nonnegative().optional(), breakpoint: z.enum(['mobile', 'tablet', 'desktop']).optional(),
};
const style = z.object({
  ...base, property: short.min(1), oldValue: text, newValue: text, state: short.optional(),
  groupId: short.optional(), groupKind: z.enum(['preset', 'multi-select', 'visibility', 'consolidate']).optional(),
  groupLabel: short.optional(),
});
const textChange = z.object({
  ...base, oldText: text, newText: text, isHtml: z.boolean().optional(),
  attributeName: z.literal('href').optional(),
}).refine(change => !change.attributeName || (
  (!change.oldText || isSafeRichTextHref(change.oldText)) &&
  (!change.newText || isSafeRichTextHref(change.newText))
), 'Unsafe imported link');
const dom = z.object({
  ...base, action: z.enum(['delete', 'duplicate', 'move', 'insert']), tagName: short,
  outerHTML: text.optional(), destination: position.optional(), origin: position.optional(),
});
const comment = z.object({
  id: short.min(1), elementId, selector: short, text,
  timestamp: finite.nonnegative(), updatedAt: finite.nonnegative(), pageUrl: short.min(1),
  resolved: z.boolean().optional(), pinOffset: point.optional(),
  region: z.object({ x: finite, y: finite, w: finite.nonnegative(), h: finite.nonnegative() }).optional(),
});
const group = z.object({
  routeKey: short.min(1), url: short.min(1),
  styleChanges: z.array(style).max(SITE_IMPORT_LIMITS.entries),
  textChanges: z.array(textChange).max(SITE_IMPORT_LIMITS.entries),
  domChanges: z.array(dom).max(SITE_IMPORT_LIMITS.entries),
  comments: z.array(comment).max(SITE_IMPORT_LIMITS.entries),
});
const envelope = z.object({
  kind: z.literal('design-mode-changes'), version: z.literal(2), url: short.min(1),
  routeGroups: z.array(group).min(1).max(SITE_IMPORT_LIMITS.routes),
});

function identityOnOrigin(href: string, origin: string) {
  const url = new URL(href);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.origin !== origin) {
    throw new Error('Every imported route must belong to the active origin');
  }
  return routeIdentity(href);
}

export function validateSiteImport(input: unknown, activeHref: string): RouteGroup[] {
  let serialized: string | undefined;
  try { serialized = JSON.stringify(input); } catch { throw new Error('Import must be a JSON object'); }
  if (!serialized || new TextEncoder().encode(serialized).byteLength > SITE_IMPORT_LIMITS.bytes) {
    throw new Error('Site import exceeds the size limit');
  }
  const parsed = envelope.parse(input);
  const active = routeIdentity(activeHref);
  identityOnOrigin(parsed.url, active.origin);
  const routes = new Set<string>();
  let count = 0;
  for (const route of parsed.routeGroups) {
    const identity = identityOnOrigin(route.url, active.origin);
    identityOnOrigin(route.routeKey, active.origin);
    if (route.routeKey !== identity.routeKey || routes.has(route.routeKey)) {
      throw new Error('Invalid or duplicate imported route key');
    }
    routes.add(route.routeKey);
    for (const entries of [route.styleChanges, route.textChanges, route.domChanges, route.comments]) {
      count += entries.length;
      if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error('Duplicate imported entry id');
    }
    if (count > SITE_IMPORT_LIMITS.entries) throw new Error('Site import exceeds the entry limit');
    for (const c of route.comments) {
      if (identityOnOrigin(c.pageUrl, active.origin).routeKey !== identity.routeKey) {
        throw new Error('Imported comment does not belong to its route');
      }
    }
  }
  return parsed.routeGroups;
}

export interface SiteImportDependencies {
  routeStore: Pick<RouteSessionStore, 'schedule' | 'flush'>;
  assertCurrent: () => void;
  // Use the comments module's serialized mutation path, checking the guard inside its lock.
  replaceRouteComments: (href: string, comments: CommentData[], assertCurrent: () => void) => Promise<void>;
}

export interface SiteImportResult {
  activePayload: RouteGroup | null;
  inactiveGroups: RouteGroup[];
}

export async function importSiteChanges(
  input: unknown, activeHref: string, dependencies: SiteImportDependencies,
): Promise<SiteImportResult> {
  const groups = validateSiteImport(input, activeHref);
  const key = routeIdentity(activeHref).routeKey;
  const activePayload = groups.find(route => route.routeKey === key) ?? null;
  const inactiveGroups = groups.filter(route => route.routeKey !== key);
  dependencies.assertCurrent();
  // The shared store owns lifetime and clear generations; raw storage writes would bypass both.
  for (const { url, styleChanges, textChanges, domChanges } of inactiveGroups) {
    dependencies.routeStore.schedule(url, { styleChanges, textChanges, domChanges });
  }
  await dependencies.routeStore.flush();
  dependencies.assertCurrent();
  for (const route of inactiveGroups) {
    await dependencies.replaceRouteComments(route.url, route.comments, dependencies.assertCurrent);
    dependencies.assertCurrent();
  }
  return { activePayload, inactiveGroups };
}
