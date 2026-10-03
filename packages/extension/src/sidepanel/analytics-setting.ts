import { analyticsConfig } from '../platform/analytics-config';

export function renderAnalyticsSetting(): string {
  const host = analyticsConfig?.host.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  return '<section aria-labelledby="dm-analytics-title" style="background:var(--dm-bg-secondary);border:1px solid var(--dm-separator);border-radius:8px;padding:12px;">' +
    '<h3 id="dm-analytics-title" style="font-size:12px;margin:0 0 8px;">Usage analytics</h3>' +
    '<p id="dm-analytics-disclosure" style="font-size:11px;line-height:1.5;">Usage analytics is on in this build. It sends feature attempts, outcomes, bounded failure reasons and MCP connection state to PostHog, with the browser package (Chrome, Firefox or Safari), extension version, validated language and timezone. No page URLs, selectors, edits, comments, text, tokens or screenshots. Each event has a new random ID. The receiver sees the IP address and normal request metadata.</p>' +
    '<p style="font-size:11px;">' + (host ? 'Receiver: ' + host + '.' : 'Unavailable in this build: no analytics project configured. Nothing is sent.') + '</p></section>';
}
