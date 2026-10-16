export const ANALYTICS_CONSENT_KEY = 'dm-analytics-consent-v1';
export const ANALYTICS_DISTINCT_ID_KEY = 'dm-analytics-distinct-id';
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
  resolved?: string;
  category?: string;
  prop?: string;
  format?: string;
  page_scheme?: string;
  error_code?: string;
  change_count_bucket?: string;
};

const eventNames: Readonly<Record<string, string>> = Object.freeze({
  inspect: 'dm_inspect', style: 'dm_style_edit', text: 'dm_text_edit', dom: 'dm_dom_edit',
  comment: 'dm_comment_update', import: 'dm_changes_import', export: 'dm_changes_export',
  screenshot: 'dm_screenshot', undo: 'dm_undo', redo: 'dm_redo',
  send_to_agent: 'dm_send_to_agent', feedback_stop: 'dm_feedback_stop', mcp_state: 'dm_mcp_state',
  copy_prompt: 'dm_copy_prompt', annotate: 'dm_annotate', token_edit: 'dm_token_edit',
  computed_css: 'dm_computed_css', theme: 'dm_theme', help: 'dm_help',
  matching_layers: 'dm_matching_layers', media: 'dm_media',
});
const features = Object.keys(eventNames);
const outcomes = ['attempt', 'command_acknowledged', 'clipboard_completed', 'clipboard_failed', 'download_initiated', 'download_failed', 'failure', 'state'];
const reasons = ['unavailable', 'rejected', 'offline', 'waiting_for_agent', 'busy'];
const modes = ['local', 'cloud', 'self-hosted'];
const states = ['offline', 'running', 'connected', 'dark', 'light', 'system', 'on', 'off'];
const actions = ['open', 'copy', 'download', 'delete', 'duplicate', 'move-up', 'move-down', 'reorder', 'wrap', 'unwrap', 'insert', 'text', 'html'];
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
const formats = ['css', 'tailwind', 'scss', 'jsx', 'markdown'];
const pageSchemes = ['http', 'https', 'localhost', 'file', 'chrome_internal', 'webstore', 'iframe', 'unknown'];
const errorCodes = [
  'no_content_script', 'restricted_url', 'tab_closed', 'element_detached', 'cross_origin_iframe',
  'empty_selection', 'bridge_unreachable', 'ws_disconnected', 'auth_token_invalid', 'agent_timeout',
  'no_active_changes', 'http_4xx', 'http_5xx', 'unavailable', 'rejected', 'unknown',
];
const changeCountBuckets = ['0', '1', '2-5', '6-20', '20+'];
const scopes = ['root', 'theme', 'component'];
const targets = ['shortcuts', 'copy_diagnostics', 'file_access_settings', 'readme', 'privacy', 'issues', 'email', 'back'];
const medias = ['svg', 'image', 'video', 'audio', 'background'];
const resolvedThemes = ['dark', 'light'];

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

export function commandOutcome(response: any): Pick<AnalyticsEvent, 'outcome' | 'reason' | 'error_code'> {
  if (response && !response.error && response.ok !== false) return { outcome: 'command_acknowledged' };
  return {
    outcome: 'failure',
    reason: response ? 'rejected' : 'unavailable',
    error_code: classifyErrorCode(response),
  };
}

export function classifyErrorCode(response: any): string {
  if (!response) return 'unavailable';
  const raw = String(response.error || response.code || response.reason || '').toLowerCase();
  if (!raw) return response.ok === false ? 'rejected' : 'unknown';
  if (/no[_ ]?content[_ ]?script|receiving end does not exist|could not establish connection/.test(raw)) return 'no_content_script';
  if (/chrome:\/\/|chrome-extension:|edge:\/\/|about:|restricted|cannot access|web store|gallery/.test(raw)) return 'restricted_url';
  if (/tab.*(closed|discarded)|no tab/.test(raw)) return 'tab_closed';
  if (/detached|not connected|stale element|node.*(removed|gone)/.test(raw)) return 'element_detached';
  if (/cross[- ]origin|iframe/.test(raw)) return 'cross_origin_iframe';
  if (/empty selection|nothing selected|no element/.test(raw)) return 'empty_selection';
  if (/bridge.?unreachable|econnrefused|failed to fetch/.test(raw)) return 'bridge_unreachable';
  if (/websocket|ws[_ ]disconnected|socket/.test(raw)) return 'ws_disconnected';
  if (/auth|token|unauthorized|401|403/.test(raw)) return 'auth_token_invalid';
  if (/timeout|timed out|agent.?timeout/.test(raw)) return 'agent_timeout';
  if (/no active changes|nothing to send|empty changes/.test(raw)) return 'no_active_changes';
  if (/\b4\d\d\b|http[_ ]4/.test(raw)) return 'http_4xx';
  if (/\b5\d\d\b|http[_ ]5/.test(raw)) return 'http_5xx';
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
  if (reasons.includes(e.reason || '')) result.reason = e.reason;
  if (modes.includes(e.mode || '')) result.mode = e.mode;
  if (states.includes(e.state || '')) result.state = e.state;
  if (actions.includes(e.action || '')) result.action = e.action;
  if (kinds.includes(e.kind || '')) result.kind = e.kind;
  if (scopes.includes(e.scope || '')) result.scope = e.scope;
  if (targets.includes(e.target || '')) result.target = e.target;
  if (medias.includes(e.media || '')) result.media = e.media;
  if (resolvedThemes.includes(e.resolved || '')) result.resolved = e.resolved;
  if (categories.includes(e.category || '')) result.category = e.category;
  if (props.includes(e.prop || '')) result.prop = e.prop;
  if (formats.includes(e.format || '')) result.format = e.format;
  if (pageSchemes.includes(e.page_scheme || '')) result.page_scheme = e.page_scheme;
  if (errorCodes.includes(e.error_code || '')) result.error_code = e.error_code;
  if (changeCountBuckets.includes(e.change_count_bucket || '')) result.change_count_bucket = e.change_count_bucket;
  return result;
}

export const messageFeatures: Readonly<Record<string, string>> = Object.freeze({
  SP_SET_INSPECT: 'inspect', SP_APPLY_STYLE: 'style', SP_APPLY_STYLES: 'style', SP_SET_TEXT: 'text', SP_SET_HTML: 'text',
  SP_DOM_ACTION: 'dom', SP_UPDATE_COMMENT: 'comment', SP_SET_COMMENT_RESOLVED: 'comment', SP_IMPORT_CHANGES: 'import',
  SP_EXPORT: 'export', SP_SCREENSHOT: 'screenshot', SP_UNDO: 'undo',
  SP_REDO: 'redo', SP_SEND_TO_AGENT: 'send_to_agent', SP_STOP_FEEDBACK_SESSION: 'feedback_stop',
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
    if (!config || !event || blocked || active.size >= 4) return;
    const epoch = generation;
    try {
      if (!nativeConsentAllowed(deps.firefox, await deps.permissions())) return;
      if (epoch !== generation || blocked || active.size >= 4) return;
      const distinctId = await resolveDistinctId();
      if (epoch !== generation || blocked || active.size >= 4) return;
      const now = Date.now();
      if (now - windowStart >= 60_000) { count = 0; windowStart = now; }
      if (count >= 60) return;
      count++;
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
            properties: { ...event, schema_version: 4, surface: 'extension',
              ...envProps, version: deps.manifest.version,
              distribution, $set: personProps, $process_person_profile: true, $geoip_disable: false } }),
        });
      } finally { clearTimeout(timeout); active.delete(controller); }
    } catch { /* Analytics must never affect an editor action; no retry or error payload. */ }
  }
  return { capture, stop, refresh };
}
