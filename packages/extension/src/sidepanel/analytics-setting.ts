import { ANALYTICS_CONSENT_KEY, consentMatches, nativeConsentAllowed, persistAnalyticsDisabled, type DataPermissions } from '../platform/analytics';
import { analyticsConfig } from '../platform/analytics-config';
import { IS_FIREFOX } from '../platform/target';

let enabled = false;
let ready = false;
let nativeConsent = false;
let busy = false;
let status = '';
let persistenceUnresolved = false;
let changed = () => {};

export async function refreshAnalyticsSetting() {
  try {
    const [stored, permissions] = await Promise.all([
      browser.storage.local.get(ANALYTICS_CONSENT_KEY),
      IS_FIREFOX ? browser.permissions.getAll() as Promise<DataPermissions> : Promise.resolve({} as DataPermissions),
    ]);
    nativeConsent = IS_FIREFOX && permissions.data_collection !== undefined;
    enabled = consentMatches(stored[ANALYTICS_CONSENT_KEY], analyticsConfig) && nativeConsentAllowed(IS_FIREFOX, permissions);
    ready = true;
  } catch { ready = false; enabled = false; status = 'Cannot read analytics consent. Saved state is unknown; a permanent stop cannot be confirmed.'; }
  changed();
}

export function initAnalyticsSetting(onChange: () => void) {
  changed = onChange;
  void refreshAnalyticsSetting();
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[ANALYTICS_CONSENT_KEY]) void refreshAnalyticsSetting();
  });
  browser.permissions.onRemoved.addListener(() => { void refreshAnalyticsSetting(); });
  browser.permissions.onAdded.addListener(() => { void refreshAnalyticsSetting(); });
}

export async function disableAnalytics() {
  enabled = false;
  // Stop the sole sender before persisting; storage removal also stops other contexts.
  const stop = browser.runtime.sendMessage({ type: 'DM_ANALYTICS_STOP' }).then(response => {
    if (!response?.ok) throw new Error('Stop not acknowledged');
  });
  const [stopped, persisted] = await Promise.allSettled([stop, persistAnalyticsDisabled(browser.storage.local)]);
  persistenceUnresolved = persisted.status === 'rejected';
  if (persistenceUnresolved) {
    status = 'Could not save opt-out. Analytics may resume after a background restart. Retry turning off; a permanent stop is not confirmed.';
    changed();
    throw new Error('Opt-out persistence failed');
  }
  if (stopped.status === 'rejected') throw new Error('Immediate stop unconfirmed');
}

export async function toggleAnalytics() {
  if (busy || (!ready && !persistenceUnresolved) || !analyticsConfig) return;
  busy = true;
  status = '';
  try {
    if (enabled || persistenceUnresolved) await disableAnalytics();
    else {
      // Call request before any await so Firefox retains the click gesture.
      const granted = !nativeConsent || await browser.permissions.request({ data_collection: ['technicalAndInteraction', 'locationInfo'] } as chrome.permissions.Permissions);
      if (!granted) { status = 'Permission declined. Analytics remains off.'; return; }
      await browser.storage.local.set({ [ANALYTICS_CONSENT_KEY]: { enabled: true, version: 2, host: analyticsConfig.host, key: analyticsConfig.key } });
    }
    await refreshAnalyticsSetting();
  } catch {
    await refreshAnalyticsSetting();
    status = persistenceUnresolved
      ? 'Could not save opt-out. Analytics may resume after a background restart. Retry turning off; a permanent stop is not confirmed.'
      : 'Could not confirm the consent change or immediate stop. Please retry.';
  } finally { busy = false; changed(); }
}

export function renderAnalyticsSetting(): string {
  const host = analyticsConfig?.host.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  return '<section aria-labelledby="dm-analytics-title" style="background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:8px;padding:12px;">' +
    '<h3 id="dm-analytics-title" style="font-size:12px;margin:0 0 8px;">Optional usage analytics</h3>' +
    '<p id="dm-analytics-disclosure" style="font-size:11px;line-height:1.5;">Help improve Design Mode by sending feature attempts, outcomes, bounded failure reasons and MCP connection state to PostHog. Includes best-effort browser name/vendor, extension version, validated browser language and timezone (which can suggest a region), and an unverified distribution label. No raw user agent or browser version. No page URLs, selectors, edits, comments, text, tokens or screenshots; no replay, automatic click tracking or persistent user ID. The receiver sees your IP address and normal request metadata. Works equally well with analytics off.</p>' +
    '<p style="font-size:11px;">' + (host ? 'Receiver: ' + host + '. A new random ID is used for every event. Successfully saving opt-out stops future sends; it cannot recall events already received. If browser storage fails, a permanent stop cannot be guaranteed.' : 'Unavailable in this build: no analytics project configured. Nothing is sent.') + '</p>' +
    '<button type="button" role="switch" aria-checked="' + enabled + '" aria-describedby="dm-analytics-disclosure" data-dm-action="toggle-analytics"' + (!analyticsConfig || (!ready && !persistenceUnresolved) || busy ? ' disabled' : '') + ' style="font:inherit;color:var(--dm-text);background:var(--dm-btn-bg);border:1px solid var(--dm-btn-border);border-radius:5px;padding:6px;">Usage analytics: ' + (persistenceUnresolved ? 'Opt-out not saved — retry' : !ready ? 'Saved state unknown' : enabled ? 'On — turn off' : 'Off — I agree to enable') + '</button>' +
    '<p role="status" style="font-size:11px;">' + status + '</p></section>';
}
