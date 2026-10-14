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
const actions = ['open', 'copy', 'download'];
const kinds = ['element', 'region'];
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

export function commandOutcome(response: any): Pick<AnalyticsEvent, 'outcome' | 'reason'> {
  return !response || response.error || response.ok === false
    ? { outcome: 'failure', reason: response ? 'rejected' : 'unavailable' }
    : { outcome: 'command_acknowledged' };
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
  return result;
}

export const messageFeatures: Readonly<Record<string, string>> = Object.freeze({
  SP_SET_INSPECT: 'inspect', SP_APPLY_STYLE: 'style', SP_APPLY_STYLES: 'style', SP_SET_TEXT: 'text', SP_SET_HTML: 'text',
  SP_DOM_ACTION: 'dom', SP_UPDATE_COMMENT: 'comment', SP_SET_COMMENT_RESOLVED: 'comment', SP_IMPORT_CHANGES: 'import',
  SP_EXPORT: 'export', SP_SCREENSHOT: 'screenshot', SP_UNDO: 'undo',
  SP_REDO: 'redo', SP_SEND_TO_AGENT: 'send_to_agent', SP_STOP_FEEDBACK_SESSION: 'feedback_stop',
  SP_SET_ROOT_VAR: 'token_edit', SP_GET_COMPUTED_CSS: 'computed_css',
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
            properties: { ...event, schema_version: 3, surface: 'extension',
              ...envProps, version: deps.manifest.version,
              distribution, $set: personProps, $process_person_profile: true, $geoip_disable: false } }),
        });
      } finally { clearTimeout(timeout); active.delete(controller); }
    } catch { /* Analytics must never affect an editor action; no retry or error payload. */ }
  }
  return { capture, stop, refresh };
}
