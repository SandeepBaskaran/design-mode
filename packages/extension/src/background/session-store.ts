import { createRouteStorageWriter, routeIdentity, SESSION_PREFIX, type RouteStorageOperation } from '../content/route-storage';

export function createSessionStore(storage: Parameters<typeof createRouteStorageWriter>[0]) {
  const write = createRouteStorageWriter(storage);
  return async (input: unknown, senderUrl: string | undefined): Promise<boolean | Record<string, unknown>> => {
    const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
    const route = (href: unknown) => {
      if (typeof href !== 'string' || !senderUrl) throw Error('Invalid session route');
      const url = new URL(href), sender = new URL(senderUrl);
      if (!['http:', 'https:', 'file:'].includes(url.protocol) || url.protocol !== sender.protocol
          || url.username || url.password || routeIdentity(href).origin !== routeIdentity(senderUrl).origin) {
        throw Error('Session route must match sender origin');
      }
    };
    const snapshot = (value: unknown) => record(value)
      && ['styleChanges', 'textChanges', 'domChanges'].every(key => Array.isArray(value[key]))
      && ['siteGeneration', 'routeGeneration'].every(key => value[key] === null || typeof value[key] === 'string');
    if (!record(input)) throw Error('Invalid session request');
    if (input.action === 'read') {
      route(input.href);
      const identity = routeIdentity(input.href);
      const records = await storage.get(null);
      return Object.fromEntries(Object.entries(records).filter(([key]) => {
        if (key === 'dm_site_generation:' + identity.origin || key === 'dm_site_clear:' + identity.origin) return true;
        const prefix = [SESSION_PREFIX, 'dm_route_generation:'].find(prefix => key.startsWith(prefix));
        if (!prefix) return false;
        try { return routeIdentity(key.slice(prefix.length)).origin === identity.origin; } catch { return false; }
      }));
    } else if (input.action === 'write') {
      if (!record(input.payload)) throw Error('Invalid session payload');
      for (const [key, value] of Object.entries(input.payload)) {
        if (!key.startsWith(SESSION_PREFIX) || !snapshot(value)) throw Error('Invalid session payload');
        route(key.slice(SESSION_PREFIX.length));
      }
    } else if (input.action === 'owned') {
      if (!record(input.ownership) || typeof input.ownership.snapshot !== 'string'
          || !snapshot(input.value)
          || input.value.siteGeneration !== input.ownership.siteGeneration
          || input.value.routeGeneration !== input.ownership.routeGeneration) throw Error('Invalid session ownership');
      route(input.ownership.href);
    } else if (input.action === 'clear') {
      if (typeof input.wholeSite !== 'boolean' || typeof input.writerId !== 'string') throw Error('Invalid session clear');
      route(input.href);
    } else throw Error('Unknown session operation');
    return write(input as RouteStorageOperation);
  };
}
