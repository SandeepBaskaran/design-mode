# Optional extension analytics

## Optional local configuration

The authorized destination is PostHog project **629592**, for the extension only,
not the website. The numeric project ID is not an ingestion token. No token is
committed. An unconfigured build has a disabled Settings switch and makes **zero
analytics network requests**; a configured build still requires explicit runtime
consent. No personal API key, SDK or new dependency is required.

For a reproducible configured build, create the ignored file
`packages/extension/.env.analytics.local` with these assignments (replace the
example origin and fake token with your authorized public ingestion values):

```dotenv
DM_POSTHOG_HOST=https://analytics.example.invalid
DM_POSTHOG_KEY=phc_fakeexample12345
DM_DISTRIBUTION=unpublished_hint
```

Run `npm run build:analytics` from the repository root, or
`npm run build:analytics` / `node build.mjs --analytics` from this directory.
Only this explicit flag reads that exact file. Ordinary `npm run build:extension`,
`npm run build`, verification and packaging do not load it; existing explicit
`DM_*` environment configuration still works as before. All builds write the same
`packages/extension/dist/`, so a subsequent normal build replaces the artifact.
The command never opts users in, changes remote settings, or sends events.

The local file accepts only the three names below, one `NAME=value` assignment per
line, optionally single/double quoted, plus blank lines and full-line `#` comments.
It is not a shell script: no `export`, interpolation, escapes, inline comments,
duplicate names or unrelated environment variables. Explicit process environment
values take precedence, including empty values (which fail validation for required
fields). Missing/unreadable files, malformed assignments or invalid effective
configuration fail before building, with errors that do not print values. Keep
personal/admin credentials out of this file and never commit it.

Configuration fields:

- `DM_POSTHOG_HOST`: the project's confirmed HTTPS ingestion origin (no path,
  credentials, query, or fragment). No default endpoint is provided.
- `DM_POSTHOG_KEY`: the public PostHog project token, starting `phc_`. Never use a
  personal/admin API key. This value is intentionally public in the built bundle.
- `DM_DISTRIBUTION`: optional `fork`, `published_hint`, `unpublished_hint`; default
  `unknown`. Forks should set `fork` and their own project. These are self-declared
  labels, not attestation. Otherwise the Chrome store update URL is a weak
  `published_hint`; Firefox and other unclassifiable installs stay `unknown`.

Both valid config **and** explicit local user consent are required. A changed
host/project invalidates saved consent. Scope version is now `2`; version `1`
consent is rejected and requires a new informed opt-in. The storage key remains
`dm-analytics-consent-v1` so existing revocation/reset listeners still apply. Consent does not enable MCP or vice versa.
The same merged manifest serves Chrome and Firefox; minimum Firefox stays 121.
No new permission is used to inspect installation source. There is no reliable
universal official/fork/store detection; IDs and packaging can be copied.

### Before any enabled distribution

1. Obtain separate authorization to create/configure a project. Verify the
   provider's current **free-only, no-card** plan and enforce account-side spend
   limits. Never enable paid products or pay-as-you-go implicitly. The official
   pricing page currently advertises 1 million Product Analytics events/month on
   the free plan. Client rate limits are not a billing guarantee across installs.
2. Choose operator, region and ingestion origin; publish real retention/deletion
   terms, operator contact and processor disclosure. No retention policy has been
   configured by this code; do not promise deletion or retention not verified.
3. Update store privacy listings and review Firefox declarations for the existing
   user-directed Cloud/Self-hosted MCP flows separately. This change declares
   optional technical analytics, not website content or authentication transfer.
4. Exercise packaged installs and the native consent prompt in supported browser
   versions. Keep analytics off if any requirement is unmet.

## Implementation and data contract

`src/platform/analytics.ts` owns configuration validation, the bounded event
schema, consent gate and direct PostHog Capture API transport. The official
browser-extension SDK guide recommends static/no-external bundles and background
sending. We use the documented Capture API instead: the SDK's automatic metadata,
remote feature loading and persistence are unnecessary risk for this small schema.
No remote scripts, autocapture, replay, surveys, feature flags or error SDK exist.
CSP is not relaxed; existing host permissions already cover the configured HTTPS
receiver and the existing CSP does not restrict `connect-src`.

Events use schema version `2`, surface `extension`. Stable semantic names at the existing real panel hooks replace `dm_feature`:

| Feature | Event |
| --- | --- |
| inspect | `dm_inspect` |
| style | `dm_style_edit` |
| text | `dm_text_edit` |
| dom | `dm_dom_edit` |
| comment | `dm_comment_update` |
| import | `dm_changes_import` |
| export | `dm_changes_export` |
| screenshot | `dm_screenshot` |
| undo / redo | `dm_undo` / `dm_redo` |
| send_to_agent | `dm_send_to_agent` |
| feedback_stop | `dm_feedback_stop` |
| mcp_state | `dm_mcp_state` |

Outcome remains a separate property; names do not imply success. Existing hooks are unchanged, not new instrumentation of unobserved actions.

- `feature`: inspect, style, text, dom, comment, import, export, screenshot, undo,
  redo, send_to_agent, feedback_stop, mcp_state.
- `outcome`: attempt, command_acknowledged, failure, state, clipboard_completed,
  clipboard_failed, download_initiated, download_failed.
- Optional `reason`: unavailable, rejected, offline, waiting_for_agent, busy.
- Optional `mode`: local, cloud, self-hosted. Optional `state`: offline, running,
  connected. These are extension-observed state, not server diagnostics.
- `browser`: `firefox` (the central `IS_FIREFOX` flag), `chrome` when UA-CH
  explicitly advertises Google Chrome, `chromium` when only that family is known,
  otherwise `unknown`. `browser_vendor`: `Mozilla`, `Google`, or `unknown`.
  These are best-effort reported signals, not brand attestation: Brave is never
  identified with certainty; privacy modes may suppress or imitate brands.
- Optional `language`: validated `navigator.language` (maximum 35 characters,
  canonical Intl locale base name; no private-use or extension subtags). Optional
  `timezone`: Intl-resolved zone, maximum 64 characters, syntactically bounded and
  validated by Intl; invalid/unavailable values are omitted. Zone can suggest a
  region. No geolocation API, raw user agent, UA-CH version, browser version or OS
  is sent. Metadata is collected by the background only after consent, never
  trusted from incoming events.
- `version`: extension manifest version; `distribution`: hints described above.
  No extension ID or user ID.
- `$process_person_profile: false`, `$geoip_disable: true`; fresh random
  `distinct_id` **for each event**, not stored or linked to MCP credentials.

Extra keys and unrecognized optional values are dropped; unknown features or
outcomes are rejected. No page URL, referrer, selector, DOM/HTML/text, comment,
content/token/auth value, screenshot, raw error or MCP message is copied. IP and
normal request metadata remain visible to the receiver; no network anonymity is
claimed. This is **aggregate-only** measurement. Per-event IDs prevent unique-user
analytics, retention cohorts, session analysis and cross-event funnels. No
persistent or session tracking identity is authorized or implemented.

Panel hooks cover allowlisted command attempts and responses. A no-error response
is only `command_acknowledged`, including empty/no-op responses: it is **not**
feature completion or agent completion. Screenshot clipboard completion/failure is
recorded only after the actual clipboard promise resolves/rejects. Screenshot
download initiation/failure refers only to the anchor click; there is no observed
save-to-disk completion, cancellation, or post-click failure. Other clipboard and
file-save paths are not comprehensively instrumented. Hooks also cover MCP state
transitions and blocked
send-to-agent friction. They do not observe arbitrary clicks or content-script
keyboard-only actions. Comment creation and client-side validation rejections
outside these command paths are not comprehensively instrumented. Event coverage
is intentionally narrow; do not infer absence of friction from absence of events.

Only the background sends. Messages must originate from this extension's panel
URL (exact extension ID, scheme, host and panel path; origin checked when supplied),
never a web/content-script sender. A tab-backed popout is valid; `sender.tab` alone
is not a reason to reject an extension-owned document. Each capture rereads consent and Firefox
permissions, then checks an invalidation generation before sending. Four requests
maximum in flight, 60 events/minute per live background context; no queue/retry,
5-second abort timeout, omitted cookies/referrer, redirects rejected. Context
restart loses in-memory counts and events but must reread persisted consent.

Opt-out sends a stop message and removes the consent record. If removal fails,
it attempts to persist `{ enabled: false, version: 2 }` under the same key. This
disabled record survives worker restart without any tracking identifier. If both
writes fail, the UI warns that the old consent can resume sending after restart;
a permanent stop cannot be promised while browser storage is unavailable. The sender aborts
requests and invalidates pending async checks; no saved identifier or queue exists
to flush. Already delivered events cannot be recalled. Reset settings opts out.
Native permission revocation conservatively clears local consent (even unrelated
permission removal disables the live sender). Once the disabled state is persisted,
regranting alone never enables it. If both storage writes fail, the same unresolved
persistence limitation applies after native permission is regranted and the worker
restarts.

## Chrome and Firefox consent

The in-product switch starts off, has a full inline disclosure and a named receiver,
and is optional for all functionality. It is unavailable until config and consent
state are loaded. In Firefox, `permissions.getAll().data_collection` presence
feature-detects native support, per Mozilla's guidance (no UA version guess).
Native `technicalAndInteraction` and `locationInfo` permissions are requested synchronously from the
click before any await. Native permission **and** the app switch are necessary.
Firefox 121–139 falls back to the same explicit in-product consent disclosure.
The manifest uses required `none` with optional `technicalAndInteraction` (an empty
required array fails web-ext schema validation). Optional `locationInfo` is also
declared and required by our native gate because timezone can reveal a region;
Mozilla lists region under location. Language/browser settings and action events
fall under technical/interaction data. Both permissions and fresh scope-2 local
consent are required before any event. `strict_min_version` remains 121.

## Verification

A separate maintainer-authorized configured-extension run verified **12 received
PostHog events** in project 629592. Its durable local report is
`design-mode-recovery/ten-batch-consolidation/analytics-real/REPORT.md` (outside
this repository). That receipt evidence applies to that tested build and observed
actions, not every event family, subsequent code, store packaging, account billing
or retention settings. Rebuild and reverify the final artifact before release;
this build-command change was tested with fake configuration and sends no events.

Run from the repository root:

```
npm run test:extension
npm run build:extension
npm exec --no -- web-ext lint -s packages/extension/dist
node packages/extension/tests/analytics-browser.mjs
node packages/extension/tests/analytics-firefox.mjs
HEADFUL=1 CHROME_BIN='/path/to/Chrome for Testing' node packages/extension/tests/analytics-popout.mjs
```

Analytics tests run as part of the standard extension test globs. Tests cover
invalid/default config, payload scrubbing, zero fetch calls without gates, changed
project, Chrome/native Firefox/121 fallback, denied native consent, UI switch
state, pending-check invalidation, in-flight abort, no retry, rate cap, restart,
and merged-manifest retention. A configured transport test uses a real loopback
HTTP receiver via an injected fetch adapter: its only destination is 127.0.0.1;
the production parser still accepts HTTPS origins only. No real PostHog call is
made. UI unit tests compile the real setting module with mocked browser APIs;
they are not proof of installed native permission dialogs. The Chromium DOM probe
checks the rendered switch/disclosure and all five consent configurations with
mock browser APIs. The installed Firefox MV3 probe checks actual native permission
revocation and storage with a mocked analytics fetch (only its test report goes
to loopback). The installed Chromium MV3 popout probe uses a disposable fixture extension with
the production sender guard and transport, real runtime sender metadata, and a
mock analytics fetch. It verifies tab-backed EVENT and STOP admission and no
capture after STOP; it does not install the entire product or exercise a docked
panel. Headful Chrome for Testing is required on macOS when headless extensions
do not start. Native grant dialogs and packaged store-install UX still need manual
review before activation.

## Future CLI/MCP scope

No CLI or server telemetry is activated here. Reuse the bounded feature/outcome
vocabulary in a future separately approved integration, with its **own** disclosed,
explicit opt-in and a `cli`/`mcp` surface. Do not read extension consent on servers,
reuse MCP bearer tokens as identity, correlate clients, or instrument tool payloads.

## Official sources checked

- https://posthog.com/docs/advanced/browser-extension
- https://posthog.com/docs/api/capture
- https://posthog.com/product-analytics/pricing
- https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent
- https://extensionworkshop.com/documentation/develop/best-practices-for-collecting-user-data-consents
