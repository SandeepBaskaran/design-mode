# Import security regression gate

Run from the repository root:

```sh
TSX_TSCONFIG_PATH=packages/extension/tsconfig.json node --import tsx --test packages/extension/src/content/*.test.ts packages/extension/src/platform/*.test.ts packages/extension/src/sidepanel/*.test.ts
node packages/extension/tests/import-security-browser.mjs
node packages/extension/tests/rich-text-browser.mjs
npm run build:extension
```

The import browser runner compiles the actual tracker, validator, DOM rollback,
comments and token modules, and extracts the actual IMPORT_CHANGES case and
revertAllPageMutations function from content/index.ts. It runs them in a fresh
headless Chromium profile, with extension storage/message transport mocked.
The source metadata response is stubbed; a deliberate late response failure
exercises rollback after DOM, trackers, tokens and comment pins changed.
It is not an installed-extension, service-worker or Firefox certification.

## Policy and traced sinks

- Parse fresh, bounded typed records before any storage request or live DOM
  change. IDs, selector syntax, state suffixes, timestamps, regions, nested
  locations, text flags, attributes and overlay structures are checked.
  Files/messages are limited to 5 MiB; lists to 5,000 records each. A rollback
  journal refuses pages above 100,000 DOM nodes before a storage write.
- Imports **reject**, rather than silently sanitize, active/unsupported HTML.
  The existing rich-editor sanitizer is deliberately not reused: its opaque
  placeholders and formatting-only output are unsuitable for reconstructing
  imported layout. No new dependency or install script was introduced; Zod
  was already a root dependency.
- HTML oldText and newText are checked, as is every DOM outerHTML (including
  delete snapshots used only by revert/preview). Thus tracker replay, preview
  old/new HTML, individual/group/full revert and deleted-node reconstruction
  receive the same admitted records. Interactive HTML editing and its in-memory
  page-origin snapshots remain available; persisted replay now uses these same
  admission checks, including for sessions created before this hardening.
- Passive HTML layout, classes/data attributes, tables, raster images, safe
  links and static SVG are retained. Scripts, event attributes, active URLs,
  templates, embedded documents, custom elements, MathML, SVG animation and
  other unsupported elements reject the entire import. Such exports require
  removing the active/unsupported structure before sharing; they are not
  silently altered. Legitimate CSS/image/link URLs may still load resources.
- Live and imported base/variant declarations use CSSOM setProperty on empty
  element-scoped rules. Values cannot become sibling rules; IDs are escaped
  and state suffixes enumerated. Token scopes must parse as selectors, not
  arbitrary at-rules. Invalid CSS declarations are inert; valid calc/var and
  future properties are not globally disabled.
- Comment and session writes are acknowledged before DOM replacement.
  A failed second write restores previous comments. A later failure restores
  original DOM node identities, CSSOM, tracker maps, tokens, comment-pin maps,
  preview state and durable session/comments. Histories are only cleared at
  successful commit, and concurrent imports in the same content instance are
  rejected. Feedback stop is deferred until success.
- Version 1 exports contain no tokens. Successful replacement clears old
  token overrides, undo/redo, guides and preview, plus panel token/selection
  caches; failed validation leaves all of these untouched.

## Evidence and limitations

The added browser gate covers benign onerror markers, encoded active hrefs,
unsafe old/new HTML, insert/duplicate/delete snapshots, malformed arrays/IDs/
selectors/regions/timestamps, size bounds, base/variant/agent CSS breakout,
token selector breakout, complex CSS, valid structured HTML, reconstruction,
delete-revert sibling placement, failures at both storage writes, late rollback
with original pin/node identity, and concurrent-import rejection.

Storage rollback is best-effort if the storage service itself remains failed;
the response reports rollback failure rather than claiming success. These are
compensating writes across the existing comment and session stores, not a
cross-tab database transaction. Browser-owned state, arbitrary page-script side
effects and edits from other tabs during an import are not covered by this
component test. An installed-extension run and human security review remain
required before security certification.

The isolated verification also ran the snapshot's typecheck: both snapshot and
correction have the same 21 pre-existing TypeScript diagnostics (after building
shared declarations), including ElementInfo gaps and existing panel typing
errors. No new type diagnostics were observed. The full extension build and
focused test gates pass; typecheck is not represented as a passing gate.
