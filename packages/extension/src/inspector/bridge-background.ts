import { bounded, CONTENT_EVENTS, INSPECTOR_PORT, LOCAL_KEYS, MESSAGE_TYPES, RPC_TIMEOUT, SESSION_KEYS, SYNC_KEYS } from './bridge-protocol';

type Hooks = {
  dispatch: (message: any, sender: chrome.runtime.MessageSender, respond: (value?: any) => void) => boolean;
  inject: (tabId: number) => Promise<void>;
  bind: (port: chrome.runtime.Port, tabId: number | null) => void;
};
type Peer = { port: chrome.runtime.Port; tab: chrome.tabs.Tab | null; generation: number; closed: boolean; ready: boolean; inflight: number; navigating?: number; binding?: Promise<void> };
export function installInspectorBridge(api: typeof chrome, hooks: Hooks) {
  const peers = new Set<Peer>();
  let storageQueue: Promise<any> = Promise.resolve();
  function post(peer: Peer, message: any) {
    if (!peer.closed && bounded(message)) { try { peer.port.postMessage(message); } catch {} }
  }
  function state(peer: Peer, value: any) {
    post(peer, { kind: 'panel', generation: peer.generation, message: { type: 'INIT_STATE', enabled: false, connected: false, tabId: null, targetChanged: true, ...value } });
  }
  function invalidate(peer: Peer, error: string) {
    peer.generation++; peer.ready = false; peer.tab = null; peer.navigating = undefined;
    hooks.bind(peer.port, null);
    state(peer, { error });
  }
  async function active() {
    const [tab] = await api.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id == null || !/^https?:\/\//i.test(tab.url ?? '')) throw new Error('Select an HTTP(S) page, then pick an element.');
    return tab;
  }
  async function validate(peer: Peer, generation: number, tab: chrome.tabs.Tab) {
    const current = await active();
    if (peer.closed || generation !== peer.generation || current.id !== tab.id || current.url !== tab.url || current.windowId !== tab.windowId) throw new Error('Inspector target changed. Pick an element again.');
  }
  function startBind(peer: Peer, expectedTab?: number) {
    if (peer.binding) return peer.binding;
    const pending = bind(peer, expectedTab);
    const generation = peer.generation;
    const task = pending.catch(error => {
      if (generation === peer.generation) {
        post(peer, { kind: 'panel', generation, message: { type: 'INSPECTOR_ERROR', error: String(error.message ?? error) } });
      }
      throw error;
    }).finally(() => { if (peer.binding === task) peer.binding = undefined; });
    peer.binding = task;
    return task;
  }
  async function bind(peer: Peer, expectedTab?: number) {
    invalidate(peer, 'Connecting to active page…');
    const generation = peer.generation;
    const tab = await active();
    if (expectedTab != null && tab.id !== expectedTab) throw new Error('Active page changed. Pick an element again.');
    await validate(peer, generation, tab);
    peer.tab = tab;
    hooks.bind(peer.port, tab.id!);
    await hooks.inject(tab.id!);
    await validate(peer, generation, tab);
    await api.tabs.sendMessage(tab.id!, { type: 'ACTIVATE_DESIGN_MODE' });
    await validate(peer, generation, tab);
    const result = await api.tabs.sendMessage(tab.id!, { type: 'GET_STATE' });
    await validate(peer, generation, tab);
    peer.ready = true;
    state(peer, { ...result, tabId: tab.id, pinnedUrl: tab.url });
  }
  function dispatch(message: any, sender: chrome.runtime.MessageSender) {
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Inspector dispatch timed out')), RPC_TIMEOUT - 500);
      const respond = (value: any) => { clearTimeout(timer); resolve(value); };
      try { if (!hooks.dispatch(message, sender, respond)) respond(undefined); }
      catch (error) { clearTimeout(timer); reject(error); }
    });
  }
  async function message(peer: Peer, request: any) {
    const msg = request.args;
    if (!msg || !MESSAGE_TYPES.has(msg.type)) throw new Error('Unsupported Inspector message');
    if (msg.type === 'SP_PANEL_CLOSING') {
      invalidate(peer, 'Inspector closed. Pick an element to reconnect.');
      return {};
    }
    if (msg.type === 'DM_ANALYTICS_EVENT' || msg.type === 'DM_ANALYTICS_STOP') {
      return dispatch(msg, { id: api.runtime.id, url: api.runtime.getURL('sidepanel/index.html') });
    }
    const repick = msg.type === 'SP_INSPECT_PAGE' || msg.type === 'SP_ACTIVATE' || (msg.type === 'SP_SET_INSPECT' && msg.on === true);
    if (repick) {
      const current = await active();
      if (!peer.ready || !peer.tab || current.id !== peer.tab.id || current.url !== peer.tab.url || current.windowId !== peer.tab.windowId) await startBind(peer);
      request.errorGeneration = peer.generation;
    }
    const tab = peer.tab;
    const generation = peer.generation;
    if (!peer.ready || !tab || (!repick && request.generation !== generation)) throw new Error('Inspector target changed. Pick an element again.');
    await validate(peer, generation, tab);
    if (peer.closed || peer.generation !== generation || Date.now() > request.deadline) throw new Error('Inspector target changed or request expired');
    const { targetTabId: _ignored, _dmTab: _untrusted, ...payload } = msg;
    const result = await dispatch({ ...payload, targetTabId: tab.id }, { id: api.runtime.id, url: api.runtime.getURL('sidepanel/index.html') });
    await validate(peer, generation, tab);
    return result;
  }
  async function storage(args: any) {
    if (!args || !['local', 'session', 'sync'].includes(args.area) || !['get', 'set', 'remove'].includes(args.method) || (args.area !== 'local' && args.method === 'remove')) throw new Error('Unsupported storage operation');
    const allowed = args.area === 'local' ? LOCAL_KEYS : args.area === 'sync' ? SYNC_KEYS : SESSION_KEYS;
    const value = args.value;
    const keys = value == null && args.method === 'get' ? [...allowed] : typeof value === 'string' ? [value] : Array.isArray(value) ? value : value && typeof value === 'object' ? Object.keys(value) : [];
    if (!keys.length || !keys.every((key: any) => typeof key === 'string' && allowed.has(key))) throw new Error('Unsupported storage key');
    if (args.method === 'set' && (!value || Array.isArray(value) || typeof value !== 'object')) throw new Error('Invalid storage values');
    const store = api.storage[args.area as 'local' | 'session' | 'sync'];
    if (!store) throw new Error('Session storage unavailable');
    if (args.method === 'get') return store.get(value == null ? keys : value);
    if (args.method === 'set') return store.set(value);
    return store.remove(keys);
  }
  api.runtime.onConnect.addListener((port) => {
    if (port.name !== INSPECTOR_PORT) return;
    if (port.sender?.id !== api.runtime.id || port.sender?.tab || port.sender?.url !== api.runtime.getURL('sidepanel/index.html')) { port.disconnect(); return; }
    const peer: Peer = { port, tab: null, generation: 0, closed: false, ready: false, inflight: 0 };
    peers.add(peer);
    port.onDisconnect.addListener(() => { peer.closed = true; peer.generation++; peers.delete(peer); hooks.bind(port, null); });
    port.onMessage.addListener((request) => {
      if (peer.closed || !bounded(request) || !Number.isSafeInteger(request?.id) || request.id < 1) return;
      if (peer.inflight >= 64) { post(peer, { kind: 'reply', id: request.id, error: 'Too many Inspector requests' }); return; }
      peer.inflight++;
      request = { ...request, errorGeneration: peer.generation, deadline: Date.now() + RPC_TIMEOUT - 500 };
      const run = () => {
        if (peer.closed || Date.now() > request.deadline) throw new Error('Inspector disconnected or request expired');
        if (request.op === 'storage') return storage(request.args);
        if (request.op === 'message') return message(peer, request);
        throw new Error('Unsupported Inspector operation');
      };
      // Storage and transport reload share one queue across every Inspector.
      const ordered = request.op === 'storage' || request.args?.type === 'SP_RECONFIGURE_TRANSPORT';
      const task = ordered ? storageQueue.then(run) : Promise.resolve().then(run);
      if (ordered) storageQueue = task.catch(() => {});
      task.then(value => {
        if (!bounded({ kind: 'reply', id: request.id, value })) throw new Error('Inspector response too large. Try a smaller selection or viewport.');
        return value;
      }).then(value => post(peer, { kind: 'reply', id: request.id, value }), error => {
        post(peer, { kind: 'reply', id: request.id, error: String(error.message ?? error) });
        if (request.errorGeneration === peer.generation) {
          post(peer, { kind: 'panel', generation: request.errorGeneration, message: { type: 'INSPECTOR_ERROR', error: String(error.message ?? error) } });
        }
      }).finally(() => peer.inflight--);
    });
    void startBind(peer).catch(() => {});
  });
  api.runtime.onMessage.addListener((msg, sender) => {
    if (!CONTENT_EVENTS.has(msg?.type) || sender.tab?.id == null || (sender.frameId != null && sender.frameId !== 0)) return false;
    for (const peer of peers) {
      const generation = peer.generation;
      const tab = peer.tab;
      if (!peer.ready || !tab || sender.tab.id !== tab.id || (sender.url && sender.url !== tab.url)) continue;
      void validate(peer, generation, tab).then(() => post(peer, { kind: 'runtime', generation, message: { ...msg, _dmTab: tab.id } })).catch(() => {});
    }
    return false;
  });
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const visible = Object.fromEntries(Object.entries(changes).filter(([key]) => key === 'dm-shortcuts' || key === 'dm-analytics-consent-v1'));
    if (!Object.keys(visible).length) return;
    for (const peer of peers) post(peer, { kind: 'storage', area, changes: visible });
  });
  const checkActiveTarget = () => {
    const observed = [...peers].map(peer => ({ peer, generation: peer.generation, tab: peer.tab }));
    void active().then(current => {
      for (const { peer, generation, tab } of observed) {
        if (!peer.closed && peer.generation === generation && tab && (current.id !== tab.id || current.url !== tab.url || current.windowId !== tab.windowId)) invalidate(peer, 'Active page changed. Pick an element again.');
      }
    }).catch(() => {
      for (const { peer, generation, tab } of observed) {
        if (!peer.closed && peer.generation === generation && tab) invalidate(peer, 'Select an HTTP(S) page, then pick an element.');
      }
    });
  };
  api.tabs.onActivated.addListener(checkActiveTarget);
  api.windows.onFocusChanged.addListener(checkActiveTarget);
  api.tabs.onRemoved.addListener((id) => { for (const peer of peers) if (peer.tab?.id === id) invalidate(peer, 'Page closed. Pick another page.'); });
  api.tabs.onUpdated.addListener((id, info) => {
    for (const peer of peers) {
      if (peer.tab?.id === id && (info.status === 'loading' || info.url)) {
        invalidate(peer, 'Page navigating…');
        peer.navigating = id;
      }
      if (peer.navigating === id && info.status === 'complete') {
        void startBind(peer, id).catch(() => {});
      }
    }
  });
}
