import type { CommentData } from '../content/comments';
import { routeIdentity, sameRoute } from '../content/route-storage';

export const COMMENT_STORAGE_KEY = 'dm-comments';
export type CommentOperation =
  | { action: 'read'; href: string }
  | { action: 'clear-route'; href: string }
  | { action: 'clear-site'; href: string }
  | { action: 'add'; href: string; comment: CommentData }
  | { action: 'replace-route'; href: string; comments: CommentData[] }
  | { action: 'delete'; href: string; id: string }
  | { action: 'update'; href: string; id: string; text: string }
  | { action: 'resolve'; href: string; id: string; resolved: boolean }
  | { action: 'offset'; href: string; id: string; offset: { x: number; y: number } | null };

interface CommentStorage {
  get(key: string): Promise<Record<string, unknown>>;
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

function validate(value: unknown, senderUrl: string | undefined): CommentOperation {
  if (!record(value) || typeof value.href !== 'string' || !senderUrl) throw new Error('Invalid comment request');
  const route = new URL(value.href);
  const sender = new URL(senderUrl);
  // Opaque origins must not compare equal just because both serialize as "null".
  if (!['http:', 'https:'].includes(route.protocol) || route.origin !== sender.origin
      || route.username || route.password) throw new Error('Comment route must match sender origin');
  switch (value.action) {
    case 'read': case 'clear-route': case 'clear-site': break;
    case 'add':
      if (!validComment(value.comment) || !sameRoute(value.comment.pageUrl, value.href)) throw new Error('Invalid comment');
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
export function createCommentStore(storage: CommentStorage) {
  let tail: Promise<unknown> = Promise.resolve();
  return (request: unknown, senderUrl: string | undefined): Promise<CommentData[]> => {
    const next = tail.then(async () => {
      const op = validate(request, senderUrl);
      const stored = await storage.get(COMMENT_STORAGE_KEY);
      let all: CommentData[] = Array.isArray(stored[COMMENT_STORAGE_KEY])
        ? stored[COMMENT_STORAGE_KEY] as CommentData[] : [];
      if (op.action === 'read') return all;
      const onRoute = (c: CommentData) => sameRoute(c.pageUrl, op.href);
      switch (op.action) {
        case 'add': all.push({ ...op.comment, pageUrl: routeIdentity(op.href).url }); break;
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
          if (comment) {
            if (op.action === 'update') comment.text = op.text;
            if (op.action === 'resolve') comment.resolved = op.resolved;
            if (op.action === 'offset') {
              if (op.offset) comment.pinOffset = op.offset; else delete comment.pinOffset;
            }
            comment.updatedAt = Date.now();
          }
        }
      }
      await storage.set({ [COMMENT_STORAGE_KEY]: all });
      return all;
    });
    // A rejected operation must not poison the shared writer for every tab.
    tail = next.catch(() => {});
    return next;
  };
}
