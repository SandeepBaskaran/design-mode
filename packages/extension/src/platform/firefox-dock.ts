// Firefox cannot focus another window and open its sidebar in one gesture.
// Prepare the existing native sidebar for the NEXT toolbar / command gesture.
// Keep the source alive until an initialized destination port takes over.
type DockAPI = {
  tabs: { get(id: number): Promise<{ windowId: number }>; update(id: number, options: { active: boolean }): Promise<unknown> };
  windows: { update(id: number, options: { focused: boolean }): Promise<unknown>; remove(id: number): Promise<unknown> };
  runtime: { getURL(path: string): string };
  sidebarAction?: {
    setPanel(options: { windowId: number; panel: string | null }): Promise<unknown>;
    isOpen(options: { windowId: number }): Promise<boolean>;
  };
};
export function createFirefoxDock(api: DockAPI) {
  const pending = new Map<number, { windowId: number; sourceWindowId: number }>();
  const panels = new Map<number, number>();
  const sidebar = api.sidebarAction!;
  let preparation: Promise<unknown> = Promise.resolve();
  async function clear(tabId: number) {
    pending.delete(tabId);
    const windowId = panels.get(tabId);
    panels.delete(tabId);
    if (windowId != null) await sidebar.setPanel({ windowId, panel: null }).catch(() => {});
  }
  return {
    begin(tabId: number, sourceWindowId: number) {
      // Register before any await, so close/unpin also cancels queued requests.
      const request = { windowId: -1, sourceWindowId };
      pending.set(tabId, request);
      const current = () => pending.get(tabId) === request;
      const task = preparation.catch(() => {}).then(async () => {
        if (!current()) return;
        try {
          const tab = await api.tabs.get(tabId);
          if (!current()) return;
          // Serialize configuration changes, including overlapping double clicks.
          for (const [other, windowId] of panels) {
            if (other !== tabId && windowId === tab.windowId) await clear(other);
          }
          if (!current()) return;
          request.windowId = tab.windowId;
          panels.set(tabId, tab.windowId);
          await sidebar.setPanel({ windowId: tab.windowId,
            panel: api.runtime.getURL('sidepanel/index.html') + '?dockTab=' + tabId });
          if (!current()) return;
          await api.tabs.update(tabId, { active: true });
          if (current()) await api.windows.update(tab.windowId, { focused: true });
        } catch (error) { if (current()) await clear(tabId); throw error; }
      });
      preparation = task;
      return task;
    },
    wantsSidebar(tab?: { id?: number; windowId?: number }) {
      const request = tab?.id == null ? undefined : pending.get(tab.id);
      return !!request && request.windowId === tab?.windowId;
    },
    async ready(tabId: number, connected = () => true) {
      const request = pending.get(tabId);
      if (!request) return;
      const current = () => pending.get(tabId) === request && connected();
      // isOpen can lag the document/port. Poll readiness only, never gesture APIs.
      for (let attempt = 0; attempt < 20 && current(); attempt++) {
        const tab = await api.tabs.get(tabId);
        if (tab.windowId !== request.windowId) return;
        if (await sidebar.isOpen({ windowId: request.windowId })) {
          if (!current()) return;
          pending.delete(tabId);
          await api.windows.remove(request.sourceWindowId);
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    },
    clear,
    async cancel(tabId: number) { if (pending.has(tabId)) await clear(tabId); },
    async destinationClosed(tabId: number) { if (!pending.has(tabId)) await clear(tabId); },
    async sourceClosed(windowId: number) {
      for (const [tabId, request] of pending) if (request.sourceWindowId === windowId) await clear(tabId);
    },
    async moved(tabId: number) { if (pending.has(tabId) || panels.has(tabId)) await clear(tabId); },
  };
}
