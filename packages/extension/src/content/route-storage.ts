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

// Capture both the key and snapshot before a debounce; navigation cannot retarget either.
export class RouteSessionStore {
  readonly writerId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  private pending = new Map<string, RouteChanges>();
  private revisions = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private writes: Promise<void> = Promise.resolve();
  constructor(private storage: () => StorageArea, private delay = 100) {}

  schedule(href: string, changes: RouteChanges): void {
    this.pending.set(sessionStorageKey(href), structuredClone(changes));
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
    const payload = Object.fromEntries([...this.pending].map(([key, value]) => [key, { ...value, savedAt: Date.now() }]));
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
      if (Object.keys(payload).length) await this.storage().set(payload);
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
    const key = sessionStorageKey(href);
    this.invalidate(href);
    return this.enqueue(async () => {
      const identity = routeIdentity(href);
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await this.storage().set({
        [ROUTE_GENERATION_PREFIX + identity.routeKey]: id,
        [SITE_CLEAR_PREFIX + identity.origin]: { id, writerId: this.writerId, routeKey: identity.routeKey },
      });
      await this.storage().remove(key);
    });
  }

  clearSite(href: string): Promise<void> {
    const origin = routeIdentity(href).origin;
    const belongs = (key: string) => {
      if (!key.startsWith(SESSION_PREFIX)) return false;
      try { return routeIdentity(key.slice(SESSION_PREFIX.length)).origin === origin; } catch { return false; }
    };
    this.invalidate(href, true);
    return this.enqueue(async () => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await this.storage().set({
        [SITE_GENERATION_PREFIX + origin]: id,
        [SITE_CLEAR_PREFIX + origin]: { id, writerId: this.writerId },
      });
      const records = await this.storage().get(null);
      const keys = Object.keys(records).filter(belongs);
      if (keys.length) await this.storage().remove(keys);
    });
  }
}
