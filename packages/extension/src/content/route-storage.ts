import type { StyleChange, TextChange, DomChange } from './change-tracker';
import type { CommentData } from './comments';

export interface RouteChanges {
  styleChanges: StyleChange[];
  textChanges: TextChange[];
  domChanges: DomChange[];
}
export interface RouteGroup extends RouteChanges {
  routeKey: string;
  url: string;
  comments: CommentData[];
}
export interface RouteIdentity { origin: string; routeKey: string; url: string }
export const SESSION_PREFIX = 'dm_session:';
export const SITE_CLEAR_PREFIX = 'dm_site_clear:';
// Persistent barriers are separate from the latest clear notification: clearing
// another route must never erase a previous route or whole-site barrier.
const SITE_GENERATION_PREFIX = 'dm_site_generation:';
const ROUTE_GENERATION_PREFIX = 'dm_route_generation:';

function generations(identity: RouteIdentity, records: Record<string, unknown>) {
  return {
    siteGeneration: records[SITE_GENERATION_PREFIX + identity.origin] ?? null,
    routeGeneration: records[ROUTE_GENERATION_PREFIX + identity.routeKey] ?? null,
  };
}

function isCurrent(identity: RouteIdentity, value: unknown, records: Record<string, unknown>): boolean {
  if (!value || typeof value !== 'object') return false;
  const saved = value as { siteGeneration?: unknown; routeGeneration?: unknown };
  const current = generations(identity, records);
  return (saved.siteGeneration ?? null) === current.siteGeneration
    && (saved.routeGeneration ?? null) === current.routeGeneration;
}

export function routeIdentity(href: string): RouteIdentity {
  const url = new URL(href);
  const hash = /^#!?\//.test(url.hash) ? url.hash : '';
  if (url.protocol === 'file:') {
    url.hash = hash;
    const routeKey = url.href;
    url.search = '';
    url.hash = '';
    // A file document is its own site; opaque "null" origins are not a tenancy boundary.
    return { origin: url.href, routeKey, url: routeKey };
  }
  const routeKey = url.origin + url.pathname + url.search + hash;
  return { origin: url.origin, routeKey, url: routeKey };
}

export function sameRoute(a: string, b: string): boolean {
  try { return routeIdentity(a).url === routeIdentity(b).url; } catch { return false; }
}

export function sessionStorageKey(href: string): string {
  return SESSION_PREFIX + routeIdentity(href).url;
}

export function emptyRouteChanges(): RouteChanges {
  return { styleChanges: [], textChanges: [], domChanges: [] };
}

export function groupSiteChanges(
  href: string, records: Record<string, unknown>, comments: CommentData[], active?: RouteChanges,
): RouteGroup[] {
  const current = routeIdentity(href);
  const groups = new Map<string, RouteGroup>();
  const ensure = (identity: RouteIdentity) => {
    let group = groups.get(identity.routeKey);
    if (!group) {
      group = { ...identity, ...emptyRouteChanges(), comments: [] };
      groups.set(identity.routeKey, group);
    }
    return group;
  };
  for (const [key, value] of Object.entries(records)) {
    if (!key.startsWith(SESSION_PREFIX) || !value || typeof value !== 'object') continue;
    let identity: RouteIdentity;
    try { identity = routeIdentity(key.slice(SESSION_PREFIX.length)); } catch { continue; }
    if (identity.origin !== current.origin || !isCurrent(identity, value, records)) continue;
    const saved = value as Partial<RouteChanges>;
    Object.assign(ensure(identity), {
      styleChanges: Array.isArray(saved.styleChanges) ? saved.styleChanges : [],
      textChanges: Array.isArray(saved.textChanges) ? saved.textChanges : [],
      domChanges: Array.isArray(saved.domChanges) ? saved.domChanges : [],
    });
  }
  for (const comment of comments) {
    let identity: RouteIdentity;
    try { identity = routeIdentity(comment.pageUrl); } catch { continue; }
    if (identity.origin === current.origin) ensure(identity).comments.push(comment);
  }
  Object.assign(ensure(current), active);
  return [...groups.values()]
    .filter(g => g.routeKey === current.routeKey || g.styleChanges.length || g.textChanges.length || g.domChanges.length || g.comments.length)
    .sort((a, b) => a.routeKey === current.routeKey ? -1 : b.routeKey === current.routeKey ? 1 : a.routeKey.localeCompare(b.routeKey))
    .map(g => ({ ...g, comments: g.comments.sort((a, b) => a.timestamp - b.timestamp) }));
}

interface StorageArea {
  get(keys: string | null): Promise<Record<string, any>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export interface RouteWriteOwnership {
  href: string;
  revision: number;
  snapshot: string;
  siteGeneration: unknown;
  routeGeneration: unknown;
}

export type RouteStorageOperation =
  | { action: 'write'; payload: Record<string, unknown> }
  | { action: 'owned'; ownership: RouteWriteOwnership; value: unknown }
  | { action: 'clear'; href: string; wholeSite: boolean; writerId: string };

function sessionSnapshot(value: unknown): string {
  // Browser storage may reorder object keys; array order and every value still matter.
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}

export function createRouteStorageWriter(storage: StorageArea) {
  let tail: Promise<unknown> = Promise.resolve();
  return (operation: RouteStorageOperation): Promise<boolean> => {
    const next = tail.then(async () => {
      const records = await storage.get(null);
      if (operation.action === 'owned') {
        const { ownership, value } = operation;
        const key = sessionStorageKey(ownership.href);
        if (!isCurrent(routeIdentity(ownership.href), ownership, records)
            || ownership.snapshot !== sessionSnapshot(records[key] ?? null)) return false;
        await storage.set({ [key]: value });
      } else if (operation.action === 'write') {
        const payload = Object.fromEntries(Object.entries(operation.payload).filter(([key, value]) =>
          isCurrent(routeIdentity(key.slice(SESSION_PREFIX.length)), value, records)));
        if (Object.keys(payload).length) await storage.set(payload);
      } else {
        const identity = routeIdentity(operation.href);
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await storage.set({
          [(operation.wholeSite ? SITE_GENERATION_PREFIX + identity.origin : ROUTE_GENERATION_PREFIX + identity.routeKey)]: id,
          [SITE_CLEAR_PREFIX + identity.origin]: { id, writerId: operation.writerId, ...(!operation.wholeSite && { routeKey: identity.routeKey }) },
        });
        const keys = Object.keys(records).filter(key => {
          if (!key.startsWith(SESSION_PREFIX)) return false;
          try {
            return operation.wholeSite ? routeIdentity(key.slice(SESSION_PREFIX.length)).origin === identity.origin : key === sessionStorageKey(operation.href);
          } catch { return false; }
        });
        if (!operation.wholeSite) await storage.remove(sessionStorageKey(operation.href));
        else if (keys.length) await storage.remove(keys);
      }
      return true;
    });
    tail = next.catch(() => {});
    return next;
  };
}

// Capture both the key and snapshot before a debounce; navigation cannot retarget either.
export class RouteSessionStore {
  readonly writerId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  private pending = new Map<string, RouteChanges>();
  private suppressedKey: string | undefined;
  private revisions = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private writes: Promise<void> = Promise.resolve();
  constructor(private storage: () => StorageArea, private delay = 100, private writer?: ReturnType<typeof createRouteStorageWriter>) {}

  private transact(operation: RouteStorageOperation): Promise<boolean> {
    this.writer ??= createRouteStorageWriter(this.storage());
    return this.writer(operation);
  }

  async captureOwnership(href: string): Promise<RouteWriteOwnership> {
    await this.flush();
    const key = sessionStorageKey(href);
    const revision = this.revisions.get(key) || 0;
    const records = await this.storage().get(null);
    return { href, revision, snapshot: sessionSnapshot(records[key] ?? null), ...generations(routeIdentity(href), records) };
  }

  private owns(ownership: RouteWriteOwnership, records: Record<string, unknown>): boolean {
    const key = sessionStorageKey(ownership.href);
    return ownership.revision === (this.revisions.get(key) || 0)
      && isCurrent(routeIdentity(ownership.href), ownership, records)
      && ownership.snapshot === sessionSnapshot(records[key] ?? null);
  }

  async assertOwnership(ownership: RouteWriteOwnership): Promise<void> {
    if (!this.owns(ownership, await this.storage().get(null))) throw Error('Session changed while importing; retry the import.');
  }

  writeOwned(ownership: RouteWriteOwnership, changes: RouteChanges, rollback = false): Promise<void> {
    return this.enqueue(async () => {
      const records = await this.storage().get(null);
      if (!this.owns(ownership, records)) {
        if (rollback) return;
        throw Error('Session changed while importing; retry the import.');
      }
      const value = { ...structuredClone(changes), savedAt: Date.now(), writeId: `${this.writerId}-${Math.random().toString(36).slice(2)}`,
        siteGeneration: ownership.siteGeneration, routeGeneration: ownership.routeGeneration };
      // Keep the original clear barriers even if another tab clears during set().
      const expected = { ...ownership };
      ownership.snapshot = sessionSnapshot(value);
      const applied = await this.transact({ action: 'owned', ownership: expected, value });
      if (!applied && !rollback) throw Error('Session changed while importing; retry the import.');
    });
  }

  withoutScheduling(href: string, work: () => void): void {
    const previous = this.suppressedKey;
    this.suppressedKey = sessionStorageKey(href);
    try { work(); } finally { this.suppressedKey = previous; }
  }

  schedule(href: string, changes: RouteChanges): void {
    const key = sessionStorageKey(href);
    if (key === this.suppressedKey) return;
    this.revisions.set(key, (this.revisions.get(key) || 0) + 1);
    this.pending.set(key, structuredClone(changes));
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush().catch(() => {}); }, this.delay);
  }

  invalidate(href: string, wholeSite = false): void {
    const identity = routeIdentity(href);
    const keys = new Set([...this.pending.keys(), ...this.revisions.keys(), sessionStorageKey(href)]);
    for (const key of keys) {
      if (wholeSite ? routeIdentity(key.slice(SESSION_PREFIX.length)).origin === identity.origin : key === sessionStorageKey(href)) {
        this.pending.delete(key);
        this.revisions.set(key, (this.revisions.get(key) || 0) + 1);
      }
    }
  }

  private enqueue(work: () => Promise<void>): Promise<void> {
    const next = this.writes.then(work);
    this.writes = next.catch(() => {});
    return next;
  }

  flush(): Promise<void> {
    clearTimeout(this.timer);
    const payload = Object.fromEntries([...this.pending].map(([key, value]) => [key, { ...value, savedAt: Date.now(), writeId: `${this.writerId}-${Math.random().toString(36).slice(2)}` }]));
    this.pending.clear();
    const revisions = new Map(Object.keys(payload).map(key => {
      const revision = this.revisions.get(key) || 0;
      this.revisions.set(key, revision);
      return [key, revision];
    }));
    return this.enqueue(async () => {
      if (!Object.keys(payload).length) return;
      const records = await this.storage().get(null);
      for (const [key, revision] of revisions) if (revision !== this.revisions.get(key)) delete payload[key];
      for (const [key, value] of Object.entries(payload)) {
        Object.assign(value, generations(routeIdentity(key.slice(SESSION_PREFIX.length)), records));
      }
      if (Object.keys(payload).length) await this.transact({ action: 'write', payload });
    });
  }

  async readAll(): Promise<Record<string, unknown>> {
    await this.flush();
    const records = await this.storage().get(null);
    for (const [key, value] of Object.entries(records)) {
      if (!key.startsWith(SESSION_PREFIX)) continue;
      try {
        if (isCurrent(routeIdentity(key.slice(SESSION_PREFIX.length)), value, records)) continue;
      } catch { /* Invalid session keys are not route records. */ }
      delete records[key];
    }
    return records;
  }

  async load(href: string): Promise<RouteChanges | null> {
    const key = sessionStorageKey(href);
    const data = await this.readAll();
    const saved = data[key] as Partial<RouteChanges> | undefined;
    if (!saved) return null;
    return {
      styleChanges: Array.isArray(saved.styleChanges) ? saved.styleChanges : [],
      textChanges: Array.isArray(saved.textChanges) ? saved.textChanges : [],
      domChanges: Array.isArray(saved.domChanges) ? saved.domChanges : [],
    };
  }

  clearRoute(href: string): Promise<void> {
    this.invalidate(href);
    return this.enqueue(async () => { await this.transact({ action: 'clear', href, wholeSite: false, writerId: this.writerId }); });
  }

  clearSite(href: string): Promise<void> {
    this.invalidate(href, true);
    return this.enqueue(async () => { await this.transact({ action: 'clear', href, wholeSite: true, writerId: this.writerId }); });
  }
}
