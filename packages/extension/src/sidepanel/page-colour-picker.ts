export type EyeDropperHost = { EyeDropper?: new () => { open(options?: { signal: AbortSignal }): Promise<{ sRGBHex: string }> } };

export function hasNativeColourPicker(host: EyeDropperHost): boolean {
  return typeof host.EyeDropper === 'function';
}

export function screenshotPoint(x: number, y: number, rect: { left: number; top: number; width: number; height: number }, width: number, height: number) {
  if (![x, y, rect.left, rect.top, rect.width, rect.height, width, height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0 || width <= 0 || height <= 0 || x < rect.left || y < rect.top || x >= rect.left + rect.width || y >= rect.top + rect.height) return null;
  return { x: Math.min(width - 1, Math.floor((x - rect.left) * width / rect.width)), y: Math.min(height - 1, Math.floor((y - rect.top) * height / rect.height)) };
}

export async function pickColour(options: {
  host: EyeDropperHost;
  document: Document;
  capture: () => Promise<{ dataUrl?: string; error?: string }>;
  isCurrent: () => boolean;
}): Promise<string | null> {
  const { host, document: doc, capture, isCurrent } = options;
  if (!isCurrent()) return null;
  const abort = new AbortController();
  // Native open must run synchronously in the original user activation.
  if (hasNativeColourPicker(host)) {
    const timer = setInterval(() => { if (!isCurrent()) abort.abort(); }, 100);
    try {
      const result = await new host.EyeDropper!().open({ signal: abort.signal });
      return isCurrent() ? result.sRGBHex : null;
    } catch (error) {
      if (!isCurrent() || (error as Error)?.name === 'AbortError') return null;
      throw error;
    } finally { clearInterval(timer); }
  }
  return new Promise((resolve, reject) => {
    const previousFocus = doc.activeElement as HTMLElement | null;
    const dialog = doc.createElement('dialog');
    dialog.setAttribute('aria-label', 'Pick a page colour');
    dialog.style.cssText = 'box-sizing:border-box;width:calc(100% - 24px);max-width:900px;max-height:90vh;overflow:auto;padding:16px;border:1px solid var(--dm-separator,#888);border-radius:8px;background:var(--dm-bg,#fff);color:var(--dm-text,#222);font:12px system-ui;';
    const title = doc.createElement('p');
    title.textContent = 'Page colours — visible viewport snapshot only. Click a pixel in the image; not the whole screen or content behind dialogs. Arrow keys move; Enter picks; Escape cancels.';
    const status = doc.createElement('p');
    status.setAttribute('role', 'status');
    status.textContent = 'Capturing page…';
    const canvas = doc.createElement('canvas');
    canvas.hidden = true;
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', 'Page snapshot colour sampler. Arrow keys move one pixel; Enter picks; Escape cancels.');
    canvas.style.cssText = 'display:none;width:100%;height:auto;cursor:crosshair;outline-offset:2px;';
    const preview = doc.createElement('div');
    preview.style.cssText = 'position:relative;';
    const cursor = doc.createElement('span');
    cursor.setAttribute('aria-hidden', 'true');
    cursor.hidden = true;
    cursor.style.cssText = 'position:absolute;pointer-events:none;width:10px;height:10px;border:1px solid white;box-shadow:0 0 0 1px black;border-radius:50%;transform:translate(-50%,-50%);';
    preview.append(canvas, cursor);
    const cancel = doc.createElement('button');
    cancel.textContent = 'Cancel';
    cancel.type = 'button';
    dialog.append(title, status, preview, cancel);
    doc.body.append(dialog);
    let finished = false;
    let image: HTMLImageElement | null = null;
    let point = { x: 0, y: 0 };
    const timer = setInterval(() => { if (!isCurrent()) finish(null); }, 100);
    const timeout = setTimeout(() => finish(null, new Error('Page capture timed out. Try again.')), 15000);
    const finish = (value: string | null, error?: Error) => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      clearTimeout(timeout);
      if (image) { image.onload = null; image.onerror = null; image.src = ''; }
      dialog.remove();
      canvas.width = canvas.height = 0;
      if (isCurrent() && previousFocus?.isConnected) previousFocus.focus();
      if (error && isCurrent()) reject(error); else resolve(value);
    };
    const readColour = () => {
      const data = canvas.getContext('2d')!.getImageData(point.x, point.y, 1, 1).data;
      return '#' + Array.from(data.slice(0, 3), n => n.toString(16).padStart(2, '0')).join('');
    };
    const showPoint = () => {
      cursor.hidden = false;
      cursor.style.left = `${(point.x + 0.5) / canvas.width * 100}%`;
      cursor.style.top = `${(point.y + 0.5) / canvas.height * 100}%`;
      status.textContent = `Pixel ${point.x + 1}, ${point.y + 1}: ${readColour()}. Enter picks this colour. Escape cancels.`;
    };
    const sample = () => {
      if (!isCurrent()) { finish(null); return; }
      try {
        finish(readColour());
      } catch { finish(null, new Error('Could not read the page snapshot.')); }
    };
    cancel.onclick = () => finish(null);
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
    dialog.addEventListener('close', () => finish(null));
    canvas.onclick = event => {
      const next = screenshotPoint(event.clientX, event.clientY, canvas.getBoundingClientRect(), canvas.width, canvas.height);
      if (next) { point = next; sample(); }
    };
    canvas.onkeydown = event => {
      const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (moves[event.key]) {
        event.preventDefault();
        const [dx, dy] = moves[event.key];
        point = { x: Math.max(0, Math.min(canvas.width - 1, point.x + dx)), y: Math.max(0, Math.min(canvas.height - 1, point.y + dy)) };
        try { showPoint(); } catch { finish(null, new Error('Could not read the page snapshot.')); }
      } else if (event.key === 'Enter') { event.preventDefault(); sample(); }
    };
    try { dialog.showModal(); } catch { finish(null, new Error('Page colour picker is unavailable in this editor.')); return; }
    cancel.focus();
    void Promise.resolve().then(() => finished || !isCurrent() ? { dataUrl: undefined } : capture()).then(result => {
      if (finished) return;
      if (!isCurrent()) { finish(null); return; }
      if (typeof result?.error === 'string' && result.error) throw new Error(result.error);
      // Never permit a response to turn image decoding into a network request.
      if (!result || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(result.dataUrl || '')) throw new Error('Page capture unavailable. Keep the target page visible and try again.');
      image = doc.createElement('img');
      image.onload = () => {
        if (finished) return;
        if (!isCurrent()) { finish(null); return; }
        try {
          canvas.width = image!.naturalWidth;
          canvas.height = image!.naturalHeight;
          if (!canvas.width || !canvas.height) throw new Error();
          canvas.getContext('2d', { willReadFrequently: true })!.drawImage(image!, 0, 0);
          clearTimeout(timeout);
          canvas.hidden = false;
          canvas.style.display = 'block';
          showPoint();
          canvas.focus();
        } catch { finish(null, new Error('Could not decode the page snapshot.')); }
      };
      image.onerror = () => finish(null, new Error('Could not decode the page snapshot.'));
      image.src = result.dataUrl!;
    }).catch(error => finish(null, error instanceof Error ? error : new Error('Page capture failed.')));
  });
}
