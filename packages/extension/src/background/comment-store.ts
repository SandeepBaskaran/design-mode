import type { CommentData } from '../content/comments';
import { routeIdentity, sameRoute } from '../content/route-storage';

export const COMMENT_STORAGE_KEY = 'dm-comments';
export const COMMENT_STORE_ERROR = 'Comments could not be saved or loaded. Please retry.';
export const COMMENT_PAGE_ERROR = 'Invalid comments on this page. Clear or import comments to recover; damaged records will be preserved.';

function normalizeComment(value: unknown): unknown {
  if (!record(value)) return value;
  return value.updatedAt === undefined && finite(value.timestamp) ? { ...value, updatedAt: value.timestamp } : value;
}
export interface CommentOwnership { id: string; siteGeneration: unknown; routeGeneration: unknown }
const COMMENT_OWNERS_KEY = 'dm-comment-owners';

export type CommentOperation =
  | { action: 'claim-route'; href: string; ownership: CommentOwnership }
  | { action: 'read'; href: string; ownership?: CommentOwnership }
  | { action: 'clear-route'; href: string }
  | { action: 'clear-site'; href: string }
  | { action: 'add'; href: string; comment: CommentData }
  | { action: 'replace-route'; href: string; comments: CommentData[]; ownership?: CommentOwnership; rollback?: boolean }
  | { action: 'delete'; href: string; id: string }
  | { action: 'update'; href: string; id: string; text: string }
  | { action: 'resolve'; href: string; id: string; resolved: boolean }
  | { action: 'offset'; href: string; id: string; offset: { x: number; y: number } | null };

interface CommentStorage {
  get(key: string | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function point(value: unknown): boolean {
  return record(value) && finite(value.x) && finite(value.y);
}
function validComment(value: unknown): value is CommentData {
  return record(value)
    && ['id', 'elementId', 'selector', 'text', 'pageUrl'].every(k => typeof value[k] === 'string')
    && finite(value.timestamp) && finite(value.updatedAt)
    && (value.resolved === undefined || typeof value.resolved === 'boolean')
    && (value.pinOffset === undefined || point(value.pinOffset))
    && (value.region === undefined || (point(value.region) && record(value.region)
      && finite(value.region.w) && finite(value.region.h)));
}

function validate(input: unknown, senderUrl: string | undefined): CommentOperation {
  if (!record(input)) throw new Error('Invalid comment request');
  let value = { ...input };
  if (!record(value) || typeof value.href !== 'string' || !senderUrl) throw new Error('Invalid comment request');
  const route = new URL(value.href);
  const sender = new URL(senderUrl);
  // Opaque origins must not compare equal just because both serialize as "null".
  if (!['http:', 'https:', 'file:'].includes(route.protocol)
      || route.protocol !== sender.protocol
      || routeIdentity(route.href).origin !== routeIdentity(sender.href).origin
      || route.username || route.password) throw new Error('Comment route must match sender origin');
  if (value.action === 'add') value = { ...value, comment: normalizeComment(value.comment) };
  if (value.action === 'replace-route' && Array.isArray(value.comments)) value = { ...value, comments: value.comments.map(normalizeComment) };
  const ownership = value.ownership;
  if (ownership !== undefined && (!record(ownership)
      || typeof ownership.id !== 'string' || !ownership.id
      || !['siteGeneration', 'routeGeneration'].every(k => ownership[k] === null || typeof ownership[k] === 'string'))) {
    throw new Error('Invalid comment ownership');
  }
  if (value.action === 'claim-route' && !value.ownership) throw new Error('Invalid comment ownership');
  if (value.rollback !== undefined && typeof value.rollback !== 'boolean') throw new Error('Invalid comment rollback');
  switch (value.action) {
    case 'claim-route': case 'read': case 'clear-route': case 'clear-site': break;
    case 'add':
      if (!validComment(value.comment) || !sameRoute(value.comment.pageUrl, route.href)) throw new Error('Invalid comment');
      break;
    case 'replace-route':
      if (!Array.isArray(value.comments) || !value.comments.every(validComment)) throw new Error('Invalid comments');
      // Import URLs are deliberately restamped to the validated target route.
      break;
    case 'delete': case 'update': case 'resolve': case 'offset':
      if (typeof value.id !== 'string'
          || (value.action === 'update' && typeof value.text !== 'string')
          || (value.action === 'resolve' && typeof value.resolved !== 'boolean')
          || (value.action === 'offset' && value.offset !== null && !point(value.offset))) throw new Error('Invalid comment update');
      break;
    default: throw new Error('Unknown comment operation');
  }
  return value as CommentOperation;
}

// Instantiate ONCE in the background. Each operation reads the latest persisted
// array only after the previous write settles, regardless of tab or web origin.
// Never cache records: storage.local remains authoritative across worker restarts.
export function createCommentStore(storage: CommentStorage, sessionStorage: Pick<CommentStorage, 'get'> = storage) {
  let tail: Promise<unknown> = Promise.resolve();
  return (request: unknown, senderUrl: string | undefined): Promise<CommentData[]> => {
    const next = tail.then(async () => {
      const op = validate(request, senderUrl);
      const stored = await storage.get(null);
      const raw = stored[COMMENT_STORAGE_KEY] ?? [];
      if (!Array.isArray(raw)) throw new Error('Invalid comment store');
      const normalized = raw.map(normalizeComment);
      const malformed = raw.filter((_, i) => !validComment(normalized[i]));
      const onRoute = (c: { pageUrl?: unknown }) => typeof c.pageUrl === 'string' && sameRoute(c.pageUrl, op.href);
      const damagedHere = (c: unknown) => record(c) && onRoute(c);
      const recovery = ['replace-route', 'clear-route', 'clear-site'].includes(op.action);
      if (malformed.some(damagedHere) && !recovery) throw new Error(COMMENT_PAGE_ERROR);
      const preserved = malformed.map(c => damagedHere(c) && recovery ? { quarantinedPageUrl: op.href, record: c } : c);
      const origin = routeIdentity(op.href).origin;
      const onSite = (c: CommentData) => {
        try { return routeIdentity(c.pageUrl).origin === origin; } catch { return false; }
      };
      let all = normalized.filter(validComment);
      const key = routeIdentity(op.href).routeKey;
      const owners: Record<string, unknown> = record(stored[COMMENT_OWNERS_KEY]) ? { ...stored[COMMENT_OWNERS_KEY] } : {};
      const ownership = 'ownership' in op ? op.ownership : undefined;
      const barriers = ownership ? await sessionStorage.get(null) : {};
      if (ownership && ((barriers['dm_site_generation:' + origin] ?? null) !== ownership.siteGeneration
          || (barriers['dm_route_generation:' + key] ?? null) !== ownership.routeGeneration
          || (op.action !== 'claim-route' && owners[key] !== ownership.id))) {
        if (op.action === 'replace-route' && op.rollback) return all.filter(onSite);
        throw Error('Comments changed while importing; retry the import.');
      }
      if (op.action === 'read') return all.filter(onSite);
      if (op.action === 'claim-route') {
        owners[key] = op.ownership.id;
        await storage.set({ [COMMENT_OWNERS_KEY]: owners });
        return all.filter(onSite);
      }
      if (!ownership) {
        if (op.action === 'clear-site') {
          for (const route of Object.keys(owners)) if (routeIdentity(route).origin === origin) delete owners[route];
        } else delete owners[key];
      }
      switch (op.action) {
        case 'add':
          if (!all.some(c => c.id === op.comment.id && onRoute(c))) all.push({ ...op.comment, pageUrl: routeIdentity(op.href).url });
          break;
        case 'replace-route':
          all = [...all.filter(c => !onRoute(c)), ...op.comments.map(c => ({ ...c, pageUrl: op.href }))];
          break;
        case 'clear-route': all = all.filter(c => !onRoute(c)); break;
        case 'clear-site': {
          const origin = routeIdentity(op.href).origin;
          all = all.filter(c => {
            try { return routeIdentity(c.pageUrl).origin !== origin; } catch { return true; }
          });
          break;
        }
        case 'delete': {
          const index = all.findIndex(c => c.id === op.id && onRoute(c));
          if (index !== -1) all.splice(index, 1);
          break;
        }
        default: {
          const comment = all.find(c => c.id === op.id && onRoute(c));
          if (!comment) throw new Error('Comment no longer exists');
          {
            if (op.action === 'update') comment.text = op.text;
            if (op.action === 'resolve') comment.resolved = op.resolved;
            if (op.action === 'offset') {
              if (op.offset) comment.pinOffset = op.offset; else delete comment.pinOffset;
            }
            comment.updatedAt = Date.now();
          }
        }
      }
      await storage.set({ [COMMENT_STORAGE_KEY]: [...all, ...preserved], [COMMENT_OWNERS_KEY]: owners });
      return all.filter(onSite);
    });
    // A rejected operation must not poison the shared writer for every tab.
    tail = next.catch(() => {});
    return next;
  };
}
