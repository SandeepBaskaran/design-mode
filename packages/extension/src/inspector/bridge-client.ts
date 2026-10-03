import { bounded, eventChannel, INSPECTOR_PORT, RPC_TIMEOUT } from './bridge-protocol';

export function createInspectorBrowser(nativeBrowser: Pick<typeof chrome, 'runtime'>): typeof chrome {
  let nativePort: chrome.runtime.Port | undefined;
  let sequence = 0;
  let generation = 0;
  let initState: any;
  const runtimeMessages = eventChannel();
  const storageChanges = eventChannel();
  const surfaces = new Set<any>();
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  function fail(error: string) {
    for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error(error)); }
    pending.clear();
    for (const surface of surfaces) surface.onMessage.emit({ type: 'INSPECTOR_ERROR', error });
  }
  function connect() {
    if (nativePort) return nativePort;
    const port = nativeBrowser.runtime.connect({ name: INSPECTOR_PORT });
    nativePort = port;
    port.onDisconnect.addListener(() => {
      if (nativePort !== port) return;
      nativePort = undefined;
      initState = undefined;
      fail('Inspector disconnected. Pick an element to reconnect.');
    });
    port.onMessage.addListener((message) => {
      if (nativePort !== port || !bounded(message)) return;
      if (message.type === 'REQUEST_SCREENSHOT') {
        for (const surface of surfaces) surface.onMessage.emit(message);
      } else if (message.kind === 'reply') {
        const task = pending.get(message.id);
        if (!task) return;
        clearTimeout(task.timer); pending.delete(message.id);
        if (message.error) task.reject(new Error(message.error)); else task.resolve(message.value);
      } else if (message.kind === 'panel') {
        if (message.message?.type === 'INSPECTOR_ERROR' && message.generation !== generation) return;
        if (message.message?.type === 'INIT_STATE') {
          generation = message.generation;
          initState = message.message;
        }
        for (const surface of surfaces) surface.onMessage.emit(message.message);
      } else if (message.kind === 'runtime' && message.generation === generation) {
        runtimeMessages.emit(message.message, {}, () => {});
      } else if (message.kind === 'storage') storageChanges.emit(message.changes, message.area);
    });
    return port;
  }
  function rpc(op: string, args: any) {
    if (!bounded(args)) return Promise.reject(new Error('Inspector request too large'));
    if (pending.size >= 64) return Promise.reject(new Error('Too many Inspector requests'));
    return new Promise<any>((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Inspector request timed out')); }, RPC_TIMEOUT);
      pending.set(id, { resolve, reject, timer });
      try { connect().postMessage({ id, op, args, generation }); }
      catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
    });
  }
  const area = (name: string) => ({
    get: (keys?: any) => rpc('storage', { area: name, method: 'get', value: keys ?? null }),
    set: (value: any) => rpc('storage', { area: name, method: 'set', value }),
    ...(name === 'local' ? { remove: (value: any) => rpc('storage', { area: name, method: 'remove', value }) } : {}),
  });
  return {
    runtime: {
      id: nativeBrowser.runtime.id,
      getURL: (path: string) => nativeBrowser.runtime.getURL?.(path) ?? path,
      sendMessage: (message: any) => rpc('message', message),
      onMessage: runtimeMessages,
      connect: (options: { name: string }) => {
        if (options?.name !== 'sidepanel') throw new Error('Unsupported Inspector port');
        const surface = { name: 'sidepanel', onMessage: eventChannel(), onDisconnect: eventChannel(),
          postMessage() { throw new Error('Inspector panel port is receive-only'); },
          disconnect() {
            surfaces.delete(surface); surface.onDisconnect.emit(surface);
            if (!surfaces.size) { nativePort?.disconnect(); nativePort = undefined; initState = undefined; fail('Inspector closed'); }
          },
        };
        surfaces.add(surface);
        connect();
        if (initState) queueMicrotask(() => { if (surfaces.has(surface)) surface.onMessage.emit(initState); });
        return surface;
      },
    },
    storage: { local: area('local'), sync: area('sync'), session: area('session'), onChanged: storageChanges },
  } as unknown as typeof chrome;
}
