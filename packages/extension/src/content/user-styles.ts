let session = '';
let enabled = true;
let installedCss = '';
let desiredCss = '';
let previewCss = '';

export function setUserStylePreview(css: string): void {
  previewCss = css;
  syncUserStyles(desiredCss);
}
let pending = Promise.resolve();
const SESSION_ATTR = 'data-dm-override-session';

export function userOverrideScope(): string {
  if (!session) session = crypto.randomUUID();
  const root = `:root[${SESSION_ATTR}="${session}"]`;
  return `:where(${root}, ${root} *)`;
}

export function setUserOverridesEnabled(value: boolean): void {
  enabled = value;
  userOverrideScope();
  if (enabled) document.documentElement.setAttribute(SESSION_ATTR, session);
  else document.documentElement.removeAttribute(SESSION_ATTR);
}

export function whenUserStylesPainted(): Promise<void> {
  return pending;
}

export function withTemporaryUserStyles(css: string, run: () => void): Promise<void> {
  const operation = pending.then(async () => {
    const inserted = await browser.runtime.sendMessage({ type: 'DM_REPLACE_USER_STYLES', css, previousCss: '' });
    if (!inserted?.ok) throw new Error(inserted?.error || 'Temporary style override unavailable');
    try {
      run();
    } finally {
      const removed = await browser.runtime.sendMessage({ type: 'DM_REPLACE_USER_STYLES', css: '', previousCss: css });
      if (!removed?.ok) throw new Error(removed?.error || 'Temporary style override cleanup failed');
    }
  });
  pending = operation.catch(() => {});
  return operation;
}

export function syncUserStyles(css: string): void {
  desiredCss = css;
  setUserOverridesEnabled(enabled);
  // Serialise remove/insert pairs in the document, not ephemeral worker memory.
  // The per-document selector gate also makes a late navigation write inert.
  pending = pending.then(async () => {
    const next = desiredCss + previewCss;
    if (next === installedCss) return;
    const result = await browser.runtime.sendMessage({ type: 'DM_REPLACE_USER_STYLES', css: next, previousCss: installedCss });
    if (!result?.ok) throw new Error(result?.error || 'Style override bridge unavailable');
    installedCss = next;
    window.dispatchEvent(new Event('dm-styles-painted'));
  }).catch(error => { console.warn('[DM] Style overrides unavailable:', error); });
}
