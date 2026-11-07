# Extension analytics

## Local configuration

The authorised destination is PostHog project **629592**, for the extension only,
not the website. The numeric project ID is not an ingestion token. No token is
committed. An unconfigured build makes **zero analytics network requests**. A
configured release build is **on by default**: it sends the events below with no
separate opt-in and no Settings switch, as `PRIVACY.md` states. On Firefox the
browser's own data-collection permission still decides whether anything is sent
(see "Disclosure and native Firefox permission"). No personal API key, SDK or new
dependency is required.

For a reproducible configured build, create the ignored file
`packages/extension/.env.analytics.local` with these assignments (replace the
example origin and fake token with your authorised public ingestion values):

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
The command does not change remote settings or send events.

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

A valid configuration is the only switch: with one, events are sent; without
one, nothing is. There is no consent prompt, saved consent record or Settings
off-switch in the product (the background passes a consent reader that always
returns nothing, and `capture` does not call it). The `dm-analytics-consent-v1`
key and its helpers (`consentMatches`, `persistAnalyticsDisabled`) are leftovers
from the earlier opt-in design and are not part of the send path. Analytics does
not enable MCP, and MCP does not enable analytics.
The same merged manifest serves Chrome and Firefox; minimum Firefox desktop is 140.
No new permission is used to inspect installation source. There is no reliable
universal official/fork/store detection; IDs and packaging can be copied.

### Before any enabled distribution

1. Obtain separate authorisation to create/configure a project. Verify the
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
schema, the Firefox data-collection gate and direct PostHog Capture API transport. The official
browser-extension SDK guide recommends static/no-external bundles and background
sending. We use the documented Capture API instead: the SDK's automatic metadata,
remote feature loading and persistence are unnecessary risk for this small schema.
No remote scripts, autocapture, replay, surveys, feature flags or error SDK exist.
CSP is not relaxed; existing host permissions already cover the configured HTTPS
receiver and the existing CSP does not restrict `connect-src`.

Events use schema version `5` (`ANALYTICS_SCHEMA_VERSION` in `analytics.ts`, where the
rule for when to bump it is written and a guard test pins it), surface `extension`.
Stable semantic names at the panel hooks map `feature` to `event`:

| Feature | Event |
| --- | --- |
| inspect | `dm_inspect` |
| style | `dm_style_edit` |
| text | `dm_text_edit` |
| dom | `dm_dom_edit` |
| comment | `dm_comment_update` |
| export | `dm_changes_export` |
| screenshot | `dm_screenshot` |
| undo / redo | `dm_undo` / `dm_redo` |
| send_to_agent | `dm_send_to_agent` |
| send_to_agent_blocked | `dm_send_to_agent_blocked` |
| setup_popup | `dm_setup_popup` |
| panel_state | `dm_panel_state` |
| mcp_state | `dm_mcp_state` |
| copy_prompt | `dm_copy_prompt` |
| annotate | `dm_annotate` |
| token_edit | `dm_token_edit` |
| computed_css | `dm_computed_css` |
| help | `dm_help` |
| matching_layers | `dm_matching_layers` |
| media | `dm_media` |

Outcome remains a separate property; names do not imply success.

- `feature`: inspect, style, text, dom, comment, export, screenshot, undo, redo,
  send_to_agent, send_to_agent_blocked, setup_popup, panel_state, mcp_state,
  copy_prompt, annotate, token_edit, computed_css, help, matching_layers, media.
- `outcome`: command_acknowledged, failure, state, clipboard_completed,
  clipboard_failed, download_initiated, download_failed. `attempt` is used only
  by `dm_annotate` (a start) and `dm_help` (a click). `dm_setup_popup` uses
  shown, step_action, resolved and dismissed; `dm_annotate` also uses completed
  and cancelled; `dm_panel_state` uses blocked.
- Optional `reason`: unavailable, rejected, offline, waiting_for_agent, busy. On
  `dm_setup_popup` it is the blocker the popup opened for, using the same codes
  as `dm_send_to_agent_blocked` (`cloud_token_missing`, `transport_inactive`,
  `no_agent_connected`, `local_server_offline`, `no_content_script`,
  `restricted_url`, and the other setup codes). On `dm_panel_state` it is
  `file_access`, `page_unavailable` or `restricted_url`.
- Optional `mode`: local, cloud, self-hosted.
- Optional `state`: offline, running, connected (for `mcp_state`); on, off (for
  `matching_layers`).
- Optional `action`: open, copy, download (distinguishes `dm_computed_css` open vs
  copy, and `dm_media` download vs copy); edit, resolve, reopen (for
  `dm_comment_update`).
- Optional `trigger`: toolbar or setup_popup (for `dm_send_to_agent` and
  `dm_send_to_agent_blocked`), so a send that worked after the popup is a plain
  filter on one event.
- Optional `step` (for `dm_setup_popup` step_action): connect_cloud,
  copy_terminal_command, copy_mcp_config, copy_agent_command, reconnect, recheck,
  switch_to_local, switch_to_cloud. These are the popup's own action ids.
- Optional `resolved_via` (for `dm_setup_popup` resolved): auto_recheck (the panel
  saw the fix itself, through its re-check or a live status update) or send_button
  (the Send button was pressed before it had).
- Optional `time_to_resolve_ms` (resolved) and `time_open_ms` (dismissed): whole
  milliseconds, clamped to 0 to 1,800,000 and rounded to the nearest second.
- Optional `error_code`: an allow-listed code such as `no_content_script`,
  `restricted_url`, `page_disconnected`, `page_script_error`, `agent_timeout` or
  `unknown`. Optional `error_message`: see "Failure text" below.
- Optional `change_count_bucket`, `page_scheme`, `format` as in `PRIVACY.md`.
- Optional `dropped_count`: how many events this install dropped (in-flight cap or
  60 per minute) since the last event that was sent, capped at 1,000. It is held
  in memory only.
- Optional `kind`: element, region (for `dm_annotate`).
- Optional `scope`: root, theme, component (for `dm_token_edit`).
- Optional `target`: shortcuts, copy_diagnostics, file_access_settings, readme,
  privacy, issues, email, back (for `dm_help`).
- Optional `media`: svg, image, video, audio, background (for `dm_media`).
- `browser`: `safari`, `firefox`, or `chrome` (from build-time target flags).
  `browser_vendor`: `Apple`, `Mozilla`, or `Google`.
- Optional `language`: validated `navigator.language` (maximum 35 characters,
  canonical Intl locale base name; no private-use or extension subtags). Optional
  `timezone`: Intl-resolved zone, maximum 64 characters, syntactically bounded and
  validated by Intl; invalid/unavailable values are omitted. Optional
  `$raw_user_agent`: bounded printable ASCII `navigator.userAgent` (maximum 512
  characters). Metadata is collected by the background, never trusted from incoming events.
- `version`: extension manifest version; `distribution`: hints described above.
  No extension ID or account user ID.
- `$process_person_profile: true`, `$geoip_disable: false`, and `$set` with
  environment/version properties; persistent random installation `distinct_id`
  stored in `storage.local` under `dm-analytics-distinct-id` (not linked to MCP credentials).

Extra keys and unrecognised optional values are dropped; unknown features or
outcomes are rejected. No page URL, referrer, selector, DOM/HTML/text, comment,
content/token/auth value, screenshot, unfiltered error or MCP message is copied.
The setup popup events carry only the enums above and rounded durations: never the
token, whether a token exists, a URL, port, host name, command or file path. IP and
normal request metadata remain visible to the receiver; GeoIP enrichment and
person profiles are enabled to support DAU/WAU/MAU, retention cohorts, and funnels.

Panel hooks cover allowlisted commands and their responses. Since schema 5 a
command reports one event with its outcome, not a separate `attempt` first. A
no-error response is only `command_acknowledged`, including empty/no-op responses:
it is **not** feature completion or agent completion. A screenshot command sends
only a failure; its clipboard or download event is its result. Screenshot clipboard completion/failure is
recorded only after the actual clipboard promise resolves/rejects. Screenshot
download initiation/failure refers only to the anchor click; there is no observed
save-to-disk completion, cancellation, or post-click failure. Other clipboard and
file-save paths are not comprehensively instrumented. Hooks also cover MCP state
transitions (sent once a state has held for five seconds), blocked
send-to-agent friction, the setup popup and blocked panel screens. They do not observe arbitrary clicks or content-script
keyboard-only actions. Annotation start, save and cancel are recorded on `dm_annotate`; comment edits and
resolves on `dm_comment_update`. Client-side validation rejections
outside these command paths are not comprehensively instrumented. Event coverage
is intentionally narrow; do not infer absence of friction from absence of events.

Only the background sends. Messages must originate from this extension's panel
URL (exact extension ID, scheme, host and panel path; origin checked when supplied),
never a web/content-script sender. A tab-backed popout is valid; `sender.tab` alone
is not a reason to reject an extension-owned document. Each capture rereads the Firefox
permissions, then checks an invalidation generation before sending. Four requests
maximum in flight, 60 events/minute per live background context (dropped events are
counted in `dropped_count`); no queue/retry,
5-second abort timeout, omitted cookies/referrer, redirects rejected. Context
restart loses in-memory counts and events.

There is no in-product opt-out. On Firefox, revoking the data-collection
permission stops the live sender (any permission removal does), aborts in-flight
requests and invalidates pending async checks; no queue exists to flush, and a
missing permission list or one without optional `technicalAndInteraction` sends nothing. Already delivered
events cannot be recalled. Removing the extension removes the installation ID.

## Failure text

`error_code` names the failure. `error_message` is sent **only when `error_code` is
`unknown`**, that is, when nothing in `classifyErrorCode` recognised the failure.
It is the first line of the message with URLs, e-mail addresses, tokens, identifiers,
file paths and quoted text replaced, ASCII only and at most 200 characters. It is
applied where the event is built and again in `boundedEvent`, so a classified
failure cannot carry text. Use the messages to teach the classifier new codes, then
the volume of `unknown` should fall.

### Release-blocking redaction limitation

Pattern replacement is not a guarantee that arbitrary unquoted private text is
removed. The unknown-message inputs originate in panel command responses and
thrown transport/browser errors; a page-derived or unexpected exception can include
unrecognised text. The bounded payload has no separate raw-page fields, but this
free-text exception needs an explicit privacy handling decision and matching store
disclosures before a configured artefact is published. Synthetic adversarial tests
and a native network review are required; a passing known-pattern test is not
universal redaction evidence. Do not remove the chosen unknown-only messages or
quietly broaden the privacy promise to resolve this gate.

## Setup popup funnel

When Send to Agent is blocked by a known setup state, the panel sends
`dm_send_to_agent_blocked`, opens the setup popup and sends `dm_setup_popup` shown.
`step_action` follows each click on a fix step. `resolved` is sent once when the
popup's own check passes, found by the panel (the three-second re-check or a live
status update) or by the popup's Send button (`resolved_via`). `dismissed` is sent
once if the popup closes
without that. A send from the popup then carries `trigger = setup_popup`. Join them
on the install (person) and time; there is no popup or session identifier.

## Schema history

- 2: random ID per event. 3: persistent installation ID. 4: edit detail.
- 5: one outcome per command (no `attempt` events, no `command_acknowledged` for
  screenshots), `dm_style_edit` once per property and outcome per two-second gesture,
  `dm_mcp_state` debounced by five seconds, and `dm_theme`, `dm_changes_import` and
  `dm_feedback_stop` removed (with the `dark`/`light`/`system` states and the
  `resolved` property). `dm_changes_export` now reports the clipboard result of the
  CSS export shortcut (pressed in the panel or on the page), with `format` and a
  change count. Dashboards that compare across versions must filter by
  `schema_version`.

## Disclosure and native Firefox permission

Usage analytics disclosure lives in `PRIVACY.md` (linked from the extension Help view)
and in browser store listings, which must also say that a sanitised message is sent
for failures the extension cannot classify. There is no separate Usage analytics
section in the extension Settings view. In Firefox, `permissions.getAll().data_collection` presence
feature-detects native support, per Mozilla's guidance (no UA version guess).
The manifest declares `data_collection_permissions.required: ["locationInfo"]` and
`optional: ["technicalAndInteraction"]`; `nativeConsentAllowed()` requires granted optional `technicalAndInteraction`.
`permissions.getAll()` reports granted optional data categories: required
`locationInfo` is not a substitute and need not appear in that list. Missing lists
and permission API failures fail closed. `strict_min_version` is 140; Firefox 139
and earlier cannot install or run this release. Permission additions refresh the
sender, removals stop it, and every new capture rechecks the optional permission.
Editor and clipboard actions remain available without analytics consent.

## Verification

A separate maintainer-authorised configured-extension run verified **12 received
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
node packages/extension/tests/analytics-firefox.mjs
HEADFUL=1 CHROME_BIN='/path/to/Chrome for Testing' node packages/extension/tests/analytics-popout.mjs
```

Analytics tests run as part of the standard extension test globs. Tests cover
invalid/default config, payload scrubbing, zero fetch calls without gates, changed
project, Chrome/native Firefox 140, independent optional denial, missing/rejected API,
pending-check invalidation, in-flight abort, no retry, rate cap, restart,
and merged-manifest retention. A configured transport test uses a real loopback
HTTP receiver via an injected fetch adapter: its only destination is 127.0.0.1;
the production parser still accepts HTTPS origins only. No real PostHog call is
made. The installed Firefox MV3 probe checks actual native permission
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
vocabulary in a future separately approved integration, with its own disclosure
and a `cli`/`mcp` surface. Do not reuse MCP bearer tokens as identity, correlate
clients, or instrument tool payloads.

## Official sources checked

- https://posthog.com/docs/advanced/browser-extension
- https://posthog.com/docs/api/capture
- https://posthog.com/product-analytics/pricing
- https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent
- https://extensionworkshop.com/documentation/develop/best-practices-for-collecting-user-data-consents
