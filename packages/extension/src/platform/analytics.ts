export const ANALYTICS_CONSENT_KEY = 'dm-analytics-consent-v1';
export const ANALYTICS_DISTINCT_ID_KEY = 'dm-analytics-distinct-id';
/**
 * Version of the event contract sent to PostHog. Dashboards filter on it
 * (currently `schema_version >= 3`), so bump it only when old and new events
 * can no longer be counted together:
 * - how users are identified changes (distinct ID source or storage key);
 * - an event or property is renamed, removed or changes meaning;
 * - a property's values change meaning or type.
 * Adding a new event or an optional property is not a bump.
 * When you bump it, update the PostHog dashboard filters in the same change.
 * History: 2 = random ID per event, 3 = persistent install ID, 4 = edit detail,
 * 5 = fewer events: no attempt outcomes, dm_theme, dm_changes_import or
 * dm_feedback_stop; dm_mcp_state debounced; dm_style_edit coalesced per gesture;
 * dm_changes_export now reports the clipboard result.
 */
export const ANALYTICS_SCHEMA_VERSION = 5;
export type AnalyticsConfig = { host: string; key: string; distribution?: string };
export type Consent = { enabled: true; host: string; key: string; version: 2 };
export type DataPermissions = { data_collection?: string[] };
export type AnalyticsEvent = {
  feature: string;
  outcome: string;
  reason?: string;
  mode?: string;
  state?: string;
  action?: string;
  kind?: string;
  scope?: string;
  target?: string;
  media?: string;
  category?: string;
  prop?: string;
  format?: string;
  page_scheme?: string;
  error_code?: string;
  error_message?: string;
  change_count_bucket?: string;
  step?: string;
  trigger?: string;
  resolved_via?: string;
  /** Whole milliseconds, clamped and rounded to the second by boundedEvent. */
  time_to_resolve_ms?: number;
  time_open_ms?: number;
};

const eventNames: Readonly<Record<string, string>> = Object.freeze({
  inspect: 'dm_inspect', style: 'dm_style_edit', text: 'dm_text_edit', dom: 'dm_dom_edit',
  comment: 'dm_comment_update', export: 'dm_changes_export',
  screenshot: 'dm_screenshot', undo: 'dm_undo', redo: 'dm_redo',
  send_to_agent: 'dm_send_to_agent', send_to_agent_blocked: 'dm_send_to_agent_blocked', mcp_state: 'dm_mcp_state',
  copy_prompt: 'dm_copy_prompt', annotate: 'dm_annotate', token_edit: 'dm_token_edit',
  computed_css: 'dm_computed_css', help: 'dm_help',
  matching_layers: 'dm_matching_layers', media: 'dm_media', setup_popup: 'dm_setup_popup',
  panel_state: 'dm_panel_state',
});
const features = Object.keys(eventNames);
const outcomes = ['attempt', 'command_acknowledged', 'clipboard_completed', 'clipboard_failed', 'download_initiated', 'download_failed', 'failure', 'state', 'shown', 'step_action', 'resolved', 'dismissed', 'completed', 'cancelled', 'blocked'];
const reasons = ['unavailable', 'rejected', 'offline', 'waiting_for_agent', 'busy'];
// Why the panel shows a blocked screen instead of the editor (dm_panel_state).
const panelReasons = ['file_access', 'page_unavailable', 'restricted_url'];
const modes = ['local', 'cloud', 'self-hosted'];
const states = ['offline', 'running', 'connected', 'on', 'off'];
const actions = ['open', 'copy', 'download', 'delete', 'duplicate', 'move-up', 'move-down', 'reorder', 'wrap', 'unwrap', 'insert', 'text', 'html', 'edit', 'resolve', 'reopen'];
const kinds = ['element', 'region'];
const categories = ['typography', 'spacing', 'layout', 'color', 'border', 'effects', 'position', 'sizing', 'preset', 'text', 'dom'];
const props = [
  'direction', 'font-family', 'font-feature-settings', 'font-kerning',
  'font-optical-sizing', 'font-size', 'font-size-adjust', 'font-stretch',
  'font-style', 'font-synthesis', 'font-variant-caps', 'font-variant-ligatures',
  'font-variant-numeric', 'font-variant-position', 'font-variation-settings', 'font-weight',
  'hyphens', 'letter-spacing', 'line-break', 'line-height',
  'list-style-image', 'list-style-position', 'list-style-type', 'overflow-wrap',
  'tab-size', 'text-align', 'text-align-last', 'text-decoration-color',
  'text-decoration-line', 'text-decoration-skip-ink', 'text-decoration-style', 'text-decoration-thickness',
  'text-indent', 'text-justify', 'text-overflow', 'text-rendering',
  'text-transform', 'text-underline-offset', 'text-underline-position', 'text-wrap',
  'unicode-bidi', 'vertical-align', 'webkit-box-orient', 'webkit-line-clamp',
  'webkit-text-fill-color', 'white-space', 'word-break', 'word-spacing',
  'writing-mode',
  'column-gap', 'gap', 'inset-block-end', 'inset-block-start',
  'inset-inline-end', 'inset-inline-start', 'margin', 'margin-block-end',
  'margin-block-start', 'margin-inline-end', 'margin-inline-start', 'padding',
  'row-gap',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
  'align-content', 'align-self', 'box-sizing', 'display',
  'flex-basis', 'flex-direction', 'flex-grow', 'flex-shrink',
  'flex-wrap', 'grid-area', 'grid-auto-columns', 'grid-auto-flow',
  'grid-auto-rows', 'grid-column', 'grid-row', 'grid-template-areas',
  'grid-template-columns', 'grid-template-rows', 'justify-self', 'order',
  'place-content', 'place-items', 'place-self',
  'background-attachment', 'background-blend-mode', 'background-clip', 'background-color',
  'background-image', 'background-origin', 'background-position', 'background-repeat',
  'background-size', 'color', 'color-scheme', 'fill-opacity',
  'fill-rule', 'forced-color-adjust', 'mask-clip', 'mask-composite',
  'mask-image', 'mask-mode', 'mask-origin', 'mask-position',
  'mask-repeat', 'mask-size', 'stroke-dasharray', 'stroke-dashoffset',
  'stroke-linecap', 'stroke-linejoin', 'stroke-width', 'webkit-background-clip',
  'border-bottom-style', 'border-bottom-width', 'border-color', 'border-left-style',
  'border-left-width', 'border-radius', 'border-right-style', 'border-right-width',
  'border-style', 'border-top-style', 'border-top-width', 'border-width',
  'corner-shape', 'outline', 'outline-offset', 'outline-style',
  'animation', 'animation-delay', 'animation-duration', 'animation-fill-mode',
  'animation-iteration-count', 'animation-name', 'animation-range', 'animation-timeline',
  'animation-timing-function', 'appearance', 'backdrop-filter', 'backface-visibility',
  'box-shadow', 'clip-path', 'cursor', 'filter',
  'isolation', 'mix-blend-mode', 'offset-anchor', 'offset-distance',
  'offset-path', 'offset-position', 'offset-rotate', 'opacity',
  'perspective', 'perspective-origin', 'pointer-events', 'rotate',
  'scale', 'scroll-timeline-axis', 'scroll-timeline-name', 'scrollbar-color',
  'scrollbar-gutter', 'scrollbar-width', 'text-shadow', 'timeline-scope',
  'transform', 'transform-box', 'transform-origin', 'transform-style',
  'transition', 'transition-behavior', 'transition-delay', 'transition-duration',
  'transition-property', 'transition-timing-function', 'translate', 'user-select',
  'view-timeline-axis', 'view-timeline-inset', 'view-timeline-name', 'view-transition-class',
  'view-transition-name', 'visibility', 'will-change',
  'anchor-name', 'bottom', 'contain', 'content-visibility',
  'left', 'overflow', 'overflow-x', 'overflow-y',
  'position', 'position-anchor', 'position-area', 'position-try-fallbacks',
  'position-try-order', 'position-visibility', 'right', 'top',
  'z-index',
  'aspect-ratio', 'height', 'max-height', 'max-width',
  'min-height', 'min-width', 'object-fit', 'width',
];
// Actions inside the Send to Agent setup popup, as `data-dm-setup-step` values
// in send-setup.ts. A closed list: nothing the user types can reach analytics.
export const SETUP_POPUP_STEPS = [
  'connect_cloud', 'copy_terminal_command', 'copy_mcp_config', 'copy_agent_command',
  'reconnect', 'recheck', 'switch_to_local', 'switch_to_cloud',
] as const;
const resolvedVia = ['auto_recheck', 'send_button'];
// Where a Send to Agent click came from: the toolbar button or the setup popup's own Send button.
const triggers = ['toolbar', 'setup_popup'];
export const SETUP_POPUP_MAX_MS = 1_800_000;
export const DROPPED_COUNT_MAX = 1000;
// Whole milliseconds, rounded to the nearest second and clamped to 0..30 min,
// so a duration cannot be used to tell one session from another.
export function clampDurationMs(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.round(Math.min(SETUP_POPUP_MAX_MS, Math.max(0, value)) / 1000) * 1000;
}
const formats = ['css', 'tailwind', 'scss', 'jsx', 'markdown'];
const pageSchemes = ['http', 'https', 'localhost', 'file', 'chrome_internal', 'webstore', 'iframe', 'unknown'];
const errorCodes = [
  'no_content_script', 'restricted_url', 'tab_closed', 'element_detached', 'cross_origin_iframe',
  'empty_selection', 'bridge_unreachable', 'ws_disconnected', 'auth_token_invalid', 'agent_timeout',
  'no_active_changes', 'http_4xx', 'http_5xx', 'unavailable', 'rejected', 'unknown',
  // Pre-flight and handoff gates (a refinement of bridge_unreachable / agent_timeout).
  'local_server_offline', 'cloud_token_missing', 'transport_inactive', 'no_agent_connected', 'agent_busy',
  'route_not_ready', 'undo_unsafe',
  'no_matching_layers', 'clipboard_denied', 'download_blocked',
  // The page script was reached but went away or threw before it answered.
  'page_disconnected', 'page_script_error',
];
const changeCountBuckets = ['0', '1', '2-5', '6-20', '20+'];
const scopes = ['root', 'theme', 'component'];
const targets = ['shortcuts', 'copy_diagnostics', 'file_access_settings', 'readme', 'privacy', 'issues', 'email', 'back'];
const medias = ['svg', 'image', 'video', 'audio', 'background'];

export function parseAnalyticsConfig(value: unknown): AnalyticsConfig | null {
  if (!value || typeof value !== 'object') return null;
  const { host, key, distribution } = value as AnalyticsConfig;
  if (typeof key !== 'string' || !/^phc_[A-Za-z0-9_-]{8,200}$/.test(key) || typeof host !== 'string') return null;
  try {
    const url = new URL(host);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    return { host: url.origin, key, distribution: ['published_hint', 'unpublished_hint', 'fork'].includes(distribution || '') ? distribution : 'unknown' };
  } catch { return null; }
}

export function consentMatches(value: unknown, config: AnalyticsConfig | null): boolean {
  if (!config || !value || typeof value !== 'object') return false;
  const consent = value as Consent;
  return consent.version === 2 && consent.enabled === true && consent.host === config.host && consent.key === config.key;
}

export function isAnalyticsSender(sender: { id?: string; url?: string; origin?: string }, runtime: { id: string; getURL: (path: string) => string }): boolean {
  if (sender.id !== runtime.id || !sender.url) return false;
  try {
    const expected = new URL(runtime.getURL('sidepanel/index.html'));
    const actual = new URL(sender.url);
    // Extension URL origins serialize to "null" in some URL implementations.
    const origin = expected.protocol + '//' + expected.host;
    return actual.protocol === expected.protocol && actual.host === expected.host &&
      actual.pathname === expected.pathname && !actual.username && !actual.password &&
      (sender.origin === undefined || sender.origin === origin);
  } catch { return false; }
}

export async function persistAnalyticsDisabled(storage: { remove: (key: string) => Promise<unknown>; set: (value: Record<string, unknown>) => Promise<unknown> }): Promise<void> {
  try { await storage.remove(ANALYTICS_CONSENT_KEY); }
  catch { await storage.set({ [ANALYTICS_CONSENT_KEY]: { enabled: false, version: 2 } }); }
}

export function commandOutcome(response: any): Pick<AnalyticsEvent, 'outcome' | 'reason' | 'error_code' | 'error_message'> {
  if (response && !response.error && response.ok !== false) return { outcome: 'command_acknowledged' };
  const error_code = classifyErrorCode(response);
  // Free text is sent only when the failure could not be classified.
  const error_message = error_code === 'unknown' ? sanitizeErrorMessage(response) : '';
  return {
    outcome: 'failure',
    reason: response ? 'rejected' : 'unavailable',
    error_code,
    ...(error_message ? { error_message } : {}),
  };
}

export function classifyErrorCode(response: any): string {
  if (!response) return 'unavailable';
  const raw = String(response.error || response.code || response.reason || '').toLowerCase();
  if (!raw) return response.ok === false ? 'rejected' : 'unknown';
  if (/no agent connected/.test(raw)) return 'no_agent_connected';
  if (/agent is implementing|already in progress/.test(raw)) return 'agent_busy';
  if (/route rendering is not confirmed|reload the destination route|navigate to the requested route|page route changed/.test(raw)) return 'route_not_ready';
  if (/cannot safely (undo|redo)/.test(raw)) return 'undo_unsafe';
  if (/no pinned tab/.test(raw)) return 'tab_closed';
  if (/no[_ ]?content[_ ]?script|receiving end does not exist|could not establish connection/.test(raw)) return 'no_content_script';
  // The page script was reached but went away before it answered: the page
  // navigated or reloaded, the extension was reloaded, or the tab was frozen.
  if (/message (port|channel) closed|extension context invalidated|context invalidated|back\/forward cache|frame with id \d+ (was removed|is showing error page)|tabs cannot be edited/.test(raw)) return 'page_disconnected';
  if (/chrome:\/\/|chrome-extension:|edge:\/\/|about:|restricted|cannot access|web store|gallery/.test(raw)) return 'restricted_url';
  if (/tab.*(closed|discarded)|no tab/.test(raw)) return 'tab_closed';
  // Setup states of the agent connection, before the generic "not connected".
  if (/not connected to the local agent/.test(raw)) return 'local_server_offline';
  if (/no cloud url|missing url or token/.test(raw)) return 'cloud_token_missing';
  if (/agent did not acknowledge/.test(raw)) return 'agent_timeout';
  if (/detached|not connected|stale element|element not found|node.*(removed|gone)/.test(raw)) return 'element_detached';
  if (/cross[- ]origin|iframe/.test(raw)) return 'cross_origin_iframe';
  if (/empty selection|nothing selected|no element|select an element|no (parent|child|region)/.test(raw)) return 'empty_selection';
  if (/bridge.?unreachable|econnrefused|failed to fetch/.test(raw)) return 'bridge_unreachable';
  if (/websocket|ws[_ ]disconnected|\bsocket\b/.test(raw)) return 'ws_disconnected';
  if (/\bauth(entication|orization|orised|orized)?\b|\btoken\b|unauthori[sz]ed|\b40[13]\b/.test(raw)) return 'auth_token_invalid';
  if (/timeout|timed out|agent.?timeout/.test(raw)) return 'agent_timeout';
  if (/no active changes|nothing to send|empty changes/.test(raw)) return 'no_active_changes';
  if (/\b4\d\d\b|http[_ ]4/.test(raw)) return 'http_4xx';
  if (/\b5\d\d\b|http[_ ]5/.test(raw)) return 'http_5xx';
  // A DOM or script error thrown inside the page while applying the command.
  if (/failed to execute|is not a function|cannot read propert|is not defined|(typeerror|rangeerror|syntaxerror|referenceerror|domexception|hierarchyrequesterror|notfounderror|invalidstateerror|securityerror)\b/.test(raw)) return 'page_script_error';
  if (errorCodes.includes(raw)) return raw;
  return 'unknown';
}

export function pageSchemeFromUrl(url: unknown): string {
  if (typeof url !== 'string' || !url) return 'unknown';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'file:') return 'file';
    if (parsed.protocol === 'chrome:' || parsed.protocol === 'chrome-extension:' || parsed.protocol === 'edge:' || parsed.protocol === 'about:' || parsed.protocol === 'moz-extension:') return 'chrome_internal';
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]') return 'localhost';
    if (parsed.hostname === 'chromewebstore.google.com' || parsed.hostname === 'chrome.google.com') return 'webstore';
    if (parsed.protocol === 'https:') return 'https';
    if (parsed.protocol === 'http:') return 'http';
  } catch { /* fall through */ }
  return 'unknown';
}

export function changeCountBucket(count: unknown): string {
  const n = typeof count === 'number' && Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (n <= 1) return String(n);
  if (n <= 5) return '2-5';
  if (n <= 20) return '6-20';
  return '20+';
}

function propCategory(prop: string): string {
  if (prop === 'text-shadow' || prop.startsWith('scrollbar-')) return 'effects';
  if (prop === 'overflow-wrap' || prop.startsWith('text-') || prop.startsWith('font-') || prop.startsWith('list-style-') || prop.startsWith('webkit-text-') || prop.startsWith('webkit-line-') || prop.startsWith('webkit-box-')) return 'typography';
  if (['direction', 'hyphens', 'letter-spacing', 'line-break', 'line-height', 'tab-size', 'unicode-bidi', 'vertical-align', 'white-space', 'word-break', 'word-spacing', 'writing-mode'].includes(prop)) return 'typography';
  if (prop.startsWith('margin') || prop.startsWith('padding') || prop.startsWith('inset') || prop === 'gap' || prop.endsWith('-gap')) return 'spacing';
  if (prop.startsWith('width') || prop.startsWith('height') || prop.startsWith('min-') || prop.startsWith('max-') || prop === 'object-fit' || prop === 'aspect-ratio') return 'sizing';
  if (prop.startsWith('border') || prop.startsWith('outline') || prop.startsWith('corner-')) return 'border';
  if (prop === 'color' || prop.startsWith('color-') || prop.startsWith('forced-color') || prop.startsWith('background-') || prop.startsWith('fill-') || prop.startsWith('stroke-') || prop.startsWith('mask-') || prop.startsWith('webkit-background')) return 'color';
  if (['display', 'box-sizing', 'order'].includes(prop) || prop.startsWith('flex-') || prop.startsWith('grid-') || prop.startsWith('align-') || prop.startsWith('justify-') || prop.startsWith('place-')) return 'layout';
  if (['top', 'right', 'bottom', 'left', 'z-index', 'overflow'].includes(prop) || prop.startsWith('overflow-') || prop.startsWith('position') || prop.startsWith('anchor-') || prop === 'contain' || prop === 'content-visibility') return 'position';
  return 'effects';
}

const ERROR_MESSAGE_MAX = 200;

// Short, human-readable reason for a failure, safe to send: first line only,
// URLs / emails / tokens / ids / file paths / quoted text removed, ASCII only,
// capped at 200 characters. Idempotent, so it is applied again when the event
// is bounded. Accepts a string, an Error, or a command response.
export function sanitizeErrorMessage(value: unknown): string {
  let text = '';
  if (typeof value === 'string') text = value;
  else if (value instanceof Error) text = value.message;
  else if (value && typeof value === 'object') {
    const r = value as { error?: unknown; message?: unknown; reason?: unknown };
    for (const candidate of [r.error, r.message, r.reason]) {
      if (typeof candidate === 'string' && candidate) { text = candidate; break; }
    }
  }
  if (!text) return '';
  return (text.slice(0, 1000).split(/\r?\n/)[0] || '')
    .replace(/\b[a-z][a-z0-9+.-]{1,30}:\/\/[^\s"'<>)\]]*/gi, '[url]')
    .replace(/\b(?:data|blob|javascript|mailto):[^\s"'<>)\]]*/gi, '[url]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [token]')
    .replace(/\b(?:phc|dm|sk|pk|ghp|gho|xox[a-z])[-_][A-Za-z0-9_-]{6,}/g, '[token]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]')
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, '[token]')
    .replace(/[A-Za-z]:\\[^\s"'<>]*/g, '[path]')
    .replace(/(^|[\s("'=])~?\/(?:[\w.@%+-]+\/)+[\w.@%+-]*/g, '$1[path]')
    .replace(/"[^"]*"|`[^`]*`|(^|[^A-Za-z0-9])'[^']*'/g, (_m, lead) => (lead || '') + '[text]')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, ERROR_MESSAGE_MAX);
}

// Failure fields for a command whose transport threw (extension context lost,
// no receiving end, port closed): the code when we can name it. When we cannot,
// the code is `unknown` and the sanitised message travels with it, which is the
// only case where free text is sent.
export function thrownFailure(error: unknown): Pick<AnalyticsEvent, 'outcome' | 'reason' | 'error_code' | 'error_message'> {
  const message = sanitizeErrorMessage(error);
  const code = classifyErrorCode({ error: error instanceof Error ? error.message : error });
  // Nothing to read at all: the transport is simply unavailable.
  if (code === 'unknown' && !message) return { outcome: 'failure', reason: 'unavailable', error_code: 'unavailable' };
  const failure = { outcome: 'failure', reason: 'unavailable', error_code: code };
  return code === 'unknown' ? { ...failure, error_message: message } : failure;
}

type McpGateState = 'offline' | 'running' | 'connected';

// Why Send to Agent was refused before anything was sent. `offline` and
// `waiting_for_agent` are setup states, not server errors: the panel never
// asked the relay to do anything. The code says which setup step is missing.
export function sendToAgentBlock(
  state: McpGateState, mode: string, hasCloudToken: boolean, statusIssue = '',
): Pick<AnalyticsEvent, 'reason' | 'error_code'> | null {
  if (state === 'connected') return null;
  if (state === 'running') return { reason: 'waiting_for_agent', error_code: 'no_agent_connected' };
  if (statusIssue && statusIssue !== 'unknown' && errorCodes.includes(statusIssue)) return { reason: 'offline', error_code: statusIssue };
  if (mode === 'local') return { reason: 'offline', error_code: 'local_server_offline' };
  return { reason: 'offline', error_code: hasCloudToken ? 'transport_inactive' : 'cloud_token_missing' };
}

export function styleAnalytics(property: unknown): Pick<AnalyticsEvent, 'prop' | 'category'> {
  const kebab = typeof property === 'string'
    ? property.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/_/g, '-').toLowerCase()
    : '';
  if (!props.includes(kebab)) return {};
  return { prop: kebab, category: propCategory(kebab) };
}

export function styleAnalyticsList(changes: unknown): Array<Pick<AnalyticsEvent, 'prop' | 'category'>> {
  if (!Array.isArray(changes)) return [];
  const seen = new Set<string>();
  const result: Array<Pick<AnalyticsEvent, 'prop' | 'category'>> = [];
  for (const change of changes.slice(0, 8)) {
    const item = styleAnalytics(change && typeof change === 'object' ? (change as { property?: unknown }).property : undefined);
    if (!item.prop || seen.has(item.prop)) continue;
    seen.add(item.prop);
    result.push(item);
  }
  return result;
}

export function nativeConsentAllowed(firefox: boolean, permissions: DataPermissions): boolean {
  return !firefox || permissions.data_collection === undefined || permissions.data_collection.includes('locationInfo');
}

export function distributionHint(config: AnalyticsConfig, manifest: { update_url?: string }): string {
  if (config.distribution && config.distribution !== 'unknown') return config.distribution;
  return manifest.update_url === 'https://clients2.google.com/service/update2/crx' ? 'published_hint' : 'unknown';
}

export function boundedEvent(value: unknown): AnalyticsEvent | null {
  if (!value || typeof value !== 'object') return null;
  const e = value as AnalyticsEvent;
  if (!features.includes(e.feature) || !outcomes.includes(e.outcome)) return null;
  const result: AnalyticsEvent = { feature: e.feature, outcome: e.outcome };
  // The setup popup names the blocker it is open for with the same codes as
  // dm_send_to_agent_blocked (cloud_token_missing, local_server_offline, ...).
  if (reasons.includes(e.reason || '') || (e.feature === 'setup_popup' && errorCodes.includes(e.reason || '') && e.reason !== 'unknown') || (e.feature === 'panel_state' && panelReasons.includes(e.reason || ''))) result.reason = e.reason;
  if ((SETUP_POPUP_STEPS as readonly string[]).includes(e.step || '')) result.step = e.step;
  if (resolvedVia.includes(e.resolved_via || '')) result.resolved_via = e.resolved_via;
  if (triggers.includes(e.trigger || '')) result.trigger = e.trigger;
  const toResolve = clampDurationMs(e.time_to_resolve_ms);
  if (toResolve !== undefined) result.time_to_resolve_ms = toResolve;
  const timeOpen = clampDurationMs(e.time_open_ms);
  if (timeOpen !== undefined) result.time_open_ms = timeOpen;
  if (modes.includes(e.mode || '')) result.mode = e.mode;
  if (states.includes(e.state || '')) result.state = e.state;
  if (actions.includes(e.action || '')) result.action = e.action;
  if (kinds.includes(e.kind || '')) result.kind = e.kind;
  if (scopes.includes(e.scope || '')) result.scope = e.scope;
  if (targets.includes(e.target || '')) result.target = e.target;
  if (medias.includes(e.media || '')) result.media = e.media;
  if (categories.includes(e.category || '')) result.category = e.category;
  if (props.includes(e.prop || '')) result.prop = e.prop;
  if (formats.includes(e.format || '')) result.format = e.format;
  if (pageSchemes.includes(e.page_scheme || '')) result.page_scheme = e.page_scheme;
  if (errorCodes.includes(e.error_code || '')) result.error_code = e.error_code;
  // Free text only for failures nothing could classify. Known codes carry no message.
  if (result.error_code === 'unknown' && typeof e.error_message === 'string') {
    const message = sanitizeErrorMessage(e.error_message);
    if (message) result.error_message = message;
  }
  if (changeCountBuckets.includes(e.change_count_bucket || '')) result.change_count_bucket = e.change_count_bucket;
  return result;
}

export const messageFeatures: Readonly<Record<string, string>> = Object.freeze({
  SP_SET_INSPECT: 'inspect', SP_APPLY_STYLE: 'style', SP_APPLY_STYLES: 'style', SP_SET_TEXT: 'text', SP_SET_HTML: 'text',
  SP_DOM_ACTION: 'dom', SP_UPDATE_COMMENT: 'comment', SP_SET_COMMENT_RESOLVED: 'comment',
  SP_EXPORT: 'export', SP_SCREENSHOT: 'screenshot', SP_UNDO: 'undo',
  SP_REDO: 'redo', SP_SEND_TO_AGENT: 'send_to_agent',
  SP_SET_ROOT_VAR: 'token_edit', SP_GET_COMPUTED_CSS: 'computed_css', SP_REORDER_LAYER: 'dom',
});

type Environment = { language?: unknown; brands?: readonly { brand: string }[]; timeZone?: unknown; userAgent?: unknown };

export function environmentProperties(firefox: boolean, environment: Environment, safari = false) {
  const browser = safari ? 'safari' : firefox ? 'firefox' : 'chrome';
  const result: Record<string, string> = { browser, browser_vendor: safari ? 'Apple' : firefox ? 'Mozilla' : 'Google' };
  const language = environment.language;
  if (typeof language === 'string' && language.length <= 35 && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(language)) {
    try {
      const locale = new Intl.Locale(language);
      result.language = locale.baseName;
    } catch { /* Omit invalid locale rather than forwarding arbitrary strings. */ }
  }
  const timeZone = environment.timeZone;
  if (typeof timeZone === 'string' && timeZone.length <= 64 && /^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+){1,2})$/.test(timeZone)) {
    try { result.timezone = new Intl.DateTimeFormat('en', { timeZone }).resolvedOptions().timeZone; }
    catch { /* Omit unsupported zones. */ }
  }
  const userAgent = environment.userAgent;
  if (typeof userAgent === 'string' && userAgent.length > 0 && userAgent.length <= 512 && /^[\x20-\x7E]+$/.test(userAgent)) {
    result.$raw_user_agent = userAgent;
  }
  return result;
}

function runtimeEnvironment(): Environment {
  const nav = typeof navigator === 'undefined' ? undefined : navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } };
  let timeZone: string | undefined;
  try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* Optional metadata. */ }
  return { language: nav?.language, brands: nav?.userAgentData?.brands, timeZone, userAgent: nav?.userAgent };
}

export type DistinctIdStorage = {
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (value: Record<string, unknown>) => Promise<unknown>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Dependencies = {
  environment?: () => Environment;
  readConsent: () => Promise<unknown>;
  permissions: () => Promise<DataPermissions>;
  storage?: DistinctIdStorage;
  firefox: boolean;
  safari?: boolean;
  manifest: { version: string; update_url?: string };
  fetch: typeof fetch;
};

export function createAnalytics(config: AnalyticsConfig | null, deps: Dependencies) {
  let generation = 0;
  let blocked = false;
  const active = new Set<AbortController>();
  let windowStart = 0;
  let count = 0;
  // Events this install dropped because of the in-flight cap or the 60/minute
  // limit. Sent as dropped_count on the next event that does go out, so
  // under-counting can be measured. Bounded, and never stored.
  let dropped = 0;
  let cachedDistinctId: string | null = null;
  let distinctIdPending: Promise<string> | null = null;
  function resolveDistinctId(): Promise<string> {
    if (cachedDistinctId) return Promise.resolve(cachedDistinctId);
    if (distinctIdPending) return distinctIdPending;
    distinctIdPending = (async () => {
      if (deps.storage) {
        try {
          const record = await deps.storage.get(ANALYTICS_DISTINCT_ID_KEY);
          const existing = record?.[ANALYTICS_DISTINCT_ID_KEY];
          if (typeof existing === 'string' && UUID_RE.test(existing)) {
            cachedDistinctId = existing;
            return existing;
          }
        } catch { /* Fall back to generated UUID if storage read fails. */ }
      }
      const next = crypto.randomUUID();
      cachedDistinctId = next;
      if (deps.storage) {
        try { await deps.storage.set({ [ANALYTICS_DISTINCT_ID_KEY]: next }); }
        catch { /* Keep in-memory ID for this session if storage write fails. */ }
      }
      return next;
    })();
    return distinctIdPending;
  }
  function stop() {
    generation++;
    blocked = true;
    for (const controller of active) controller.abort();
    active.clear();
  }
  function refresh() { stop(); blocked = false; }
  async function capture(value: unknown): Promise<void> {
    const event = boundedEvent(value);
    if (!config || !event || blocked) return;
    if (active.size >= 4) { dropped = Math.min(dropped + 1, DROPPED_COUNT_MAX); return; }
    const epoch = generation;
    try {
      if (!nativeConsentAllowed(deps.firefox, await deps.permissions())) return;
      if (epoch !== generation || blocked) return;
      if (active.size >= 4) { dropped = Math.min(dropped + 1, DROPPED_COUNT_MAX); return; }
      const distinctId = await resolveDistinctId();
      if (epoch !== generation || blocked) return;
      if (active.size >= 4) { dropped = Math.min(dropped + 1, DROPPED_COUNT_MAX); return; }
      const now = Date.now();
      if (now - windowStart >= 60_000) { count = 0; windowStart = now; }
      if (count >= 60) { dropped = Math.min(dropped + 1, DROPPED_COUNT_MAX); return; }
      count++;
      const droppedBefore = dropped;
      dropped = 0;
      const controller = new AbortController();
      active.add(controller);
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const envProps = environmentProperties(deps.firefox, (deps.environment || runtimeEnvironment)(), deps.safari);
        const distribution = distributionHint(config, deps.manifest);
        const personProps: Record<string, string> = {
          browser: envProps.browser,
          browser_vendor: envProps.browser_vendor,
          version: deps.manifest.version,
          distribution,
        };
        if (envProps.language) personProps.language = envProps.language;
        if (envProps.timezone) personProps.timezone = envProps.timezone;
        if (envProps.$raw_user_agent) personProps.$raw_user_agent = envProps.$raw_user_agent;
        await deps.fetch(config.host + '/i/v0/e/', {
          method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error',
          headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ api_key: config.key, distinct_id: distinctId, event: eventNames[event.feature],
            properties: { ...event, ...(droppedBefore > 0 ? { dropped_count: droppedBefore } : {}), schema_version: ANALYTICS_SCHEMA_VERSION, surface: 'extension',
              ...envProps, version: deps.manifest.version,
              distribution, $set: personProps, $process_person_profile: true, $geoip_disable: false } }),
        });
      } finally { clearTimeout(timeout); active.delete(controller); }
    } catch { /* Analytics must never affect an editor action; no retry or error payload. */ }
  }
  return { capture, stop, refresh };
}
