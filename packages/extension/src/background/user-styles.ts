export async function replaceUserStyles(
  message: { css?: unknown; previousCss?: unknown },
  sender: chrome.runtime.MessageSender,
): Promise<{ ok: boolean; error?: string }> {
  if (sender.id !== browser.runtime.id || sender.tab?.id == null || sender.frameId == null
    || typeof message.css !== 'string' || typeof message.previousCss !== 'string'
    || message.css.length > 2_000_000 || message.previousCss.length > 2_000_000) {
    return { ok: false, error: 'Invalid style override request.' };
  }
  const target = { tabId: sender.tab.id, frameIds: [sender.frameId] };
  const previous = { target, css: message.previousCss, origin: 'USER' as const };
  try {
    if (message.previousCss) await browser.scripting.removeCSS(previous);
    try {
      if (message.css) await browser.scripting.insertCSS({ target, css: message.css, origin: 'USER' });
    } catch (error) {
      if (message.previousCss) await browser.scripting.insertCSS(previous);
      throw error;
    }
    return { ok: true };
  } catch {
    const error = 'Page overrides could not be applied. Reload the page and reopen Design Mode. Page !important styles may still win.';
    void browser.runtime.sendMessage({ type: 'STYLE_OVERRIDE_ERROR', error, _dmTab: sender.tab.id }).catch(() => {});
    return { ok: false, error };
  }
}
