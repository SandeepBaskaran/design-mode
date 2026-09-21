import type { CommentData } from '../content/comments';

const STORAGE_KEY = 'dm-comments';
export const COMMENT_STORE_ERROR = 'Comments could not be saved or loaded. Please retry.';
export const COMMENT_PAGE_ERROR = 'Invalid comments on this page. Clear or import comments to recover; damaged records will be preserved.';

export type CommentOperation =
  | { kind: 'read' }
  | { kind: 'add'; comment: CommentData }
  | { kind: 'replacePage'; comments: CommentData[] }
  | { kind: 'update'; id: string; text: string }
  | { kind: 'resolve'; id: string; resolved: boolean }
  | { kind: 'offset'; id: string; offset: { x: number; y: number } | null }
  | { kind: 'delete'; id: string };

export interface CommentResult { comments: CommentData[]; comment: CommentData | null }
type Storage = Pick<typeof chrome.storage.local, 'get' | 'set'>;

function isComment(value: unknown): value is CommentData {
  if (!value || typeof value !== 'object') return false;
  const c = value as CommentData;
  return ['id', 'elementId', 'selector', 'text', 'pageUrl'].every(key => typeof c[key as keyof CommentData] === 'string')
    && Number.isFinite(c.timestamp) && Number.isFinite(c.updatedAt)
    && (c.resolved === undefined || typeof c.resolved === 'boolean')
    && (c.pinOffset === undefined || !!c.pinOffset && Number.isFinite(c.pinOffset.x) && Number.isFinite(c.pinOffset.y))
    && (c.region === undefined || !!c.region && ['x', 'y', 'w', 'h'].every(key => Number.isFinite(c.region![key as keyof NonNullable<CommentData['region']>])));
}

function normalizeComment(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const c = value as CommentData;
  return c.updatedAt === undefined && Number.isFinite(c.timestamp)
    ? { ...c, updatedAt: c.timestamp } : value;
}

function validateOperation(operation: CommentOperation): void {
  switch (operation.kind) {
    case 'read': return;
    case 'add': if (isComment(operation.comment)) return; break;
    case 'replacePage': if (Array.isArray(operation.comments) && operation.comments.every(isComment)) return; break;
    case 'delete': if (typeof operation.id === 'string') return; break;
    case 'update': if (typeof operation.id === 'string' && typeof operation.text === 'string') return; break;
    case 'resolve': if (typeof operation.id === 'string' && typeof operation.resolved === 'boolean') return; break;
    case 'offset':
      if (typeof operation.id === 'string' && (operation.offset === null || operation.offset && Number.isFinite(operation.offset.x) && Number.isFinite(operation.offset.y))) return;
  }
  throw new Error('Invalid comment operation');
}

export function createCommentStore(storage: Storage) {
  let tail: Promise<unknown> = Promise.resolve();
  return (pageUrl: string, incoming: CommentOperation): Promise<CommentResult> => {
    // Only the background owns this queue; every transaction reloads durable state.
    const result = tail.then(async () => {
      const operation: CommentOperation = incoming.kind === 'add'
        ? { ...incoming, comment: normalizeComment(incoming.comment) as CommentData }
        : incoming.kind === 'replacePage' && Array.isArray(incoming.comments)
          ? { ...incoming, comments: incoming.comments.map(normalizeComment) as CommentData[] }
          : incoming;
      validateOperation(operation);
      const stored = await storage.get(STORAGE_KEY);
      const value = stored[STORAGE_KEY] ?? [];
      if (!Array.isArray(value)) throw new Error('Invalid comment store');
      const normalized = value.map(normalizeComment);
      const malformed = value.filter((_, i) => !isComment(normalized[i]));
      const belongsToPage = (c: any) => c && typeof c === 'object' && c.pageUrl === pageUrl;
      if (malformed.some(belongsToPage) && operation.kind !== 'replacePage') {
        throw new Error(COMMENT_PAGE_ERROR);
      }
      // Keep damaged records in the same durable store, outside active page reads.
      const preserved = malformed.map(c => belongsToPage(c)
        ? { quarantinedPageUrl: pageUrl, record: c } : c);
      let all: CommentData[] = normalized.filter(isComment);
      let comment: CommentData | null = null;
      switch (operation.kind) {
        case 'read': break;
        case 'add': {
          comment = { ...operation.comment, pageUrl };
          const existing = all.find(c => c.pageUrl === pageUrl && c.id === comment!.id);
          if (existing) comment = existing;
          else all.push(comment);
          break;
        }
        case 'replacePage':
          all = [...all.filter(c => c.pageUrl !== pageUrl), ...operation.comments.map(c => ({ ...c, pageUrl }))];
          break;
        case 'delete':
          all = all.filter(c => c.pageUrl !== pageUrl || c.id !== operation.id);
          break;
        case 'update':
        case 'resolve':
        case 'offset':
          comment = all.find(c => c.pageUrl === pageUrl && c.id === operation.id) ?? null;
          if (!comment) throw new Error('Comment no longer exists');
          if (operation.kind === 'update') { comment.text = operation.text; comment.updatedAt = Date.now(); }
          if (operation.kind === 'resolve') { comment.resolved = operation.resolved; comment.updatedAt = Date.now(); }
          if (operation.kind === 'offset') {
            if (operation.offset) comment.pinOffset = operation.offset;
            else delete comment.pinOffset;
          }
          break;
        default: throw new Error('Invalid comment operation');
      }
      if (operation.kind !== 'read') await storage.set({ [STORAGE_KEY]: [...all, ...preserved] });
      return { comments: all.filter(c => c.pageUrl === pageUrl), comment };
    });
    // A failed write must reach its caller without poisoning later retries.
    tail = result.catch(() => {});
    return result;
  };
}
