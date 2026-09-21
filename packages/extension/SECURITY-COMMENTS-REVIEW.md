# Extension security and comment persistence review

## CodeQL alert 3: `js/xss-through-dom`

The reported source/sink pair was the link URL input in `sidepanel.ts` (original lines 12102 → 12117). The value is trimmed, then nonempty values must pass `isSafeRichTextHref` before reaching `link.setAttribute('href', value)`. Empty input removes the attribute. `setAttribute` does not parse quote characters as new HTML attributes; escaping the URL would change its meaning rather than fix an execution boundary.

The existing allowlist permits explicit HTTP(S), fragments, root-relative paths excluding `//`, and dot-relative paths. Active schemes (`javascript:`, `data:`, `vbscript:`), including case and embedded-tab variants, do not satisfy it. On that traced path the reported JavaScript-URL XSS is a false positive based on the guard; no CodeQL suppression or alert dismissal was added. A fresh CodeQL run has not been performed.

The complete path matters:

- Inspected-page `innerHTML` enters the privileged editor through `sanitizeRichTextHtml`, which parses inertly, replaces opaque/unsafe elements with placeholders, removes non-allowlisted attributes, and validates decoded href values.
- The URL change handler validates before mutating the editor link.
- `applyHtml` itself is a message forwarder, **not an HTML sanitizer**. `SP_SET_HTML` reaches the inspected page's `applyHtmlChange(..., preserveStructure=true)` and `restoreRichTextHtml`, which restores page-owned structure and rechecks link hrefs.
- The following panel render sanitizes page-derived markup again.

A separate URL-policy gap was found: `/\\host` and slash/control/slash inputs passed the old prefix check even though browser URL normalization can interpret them as protocol-relative URLs. The shared guard now rejects embedded C0 controls, DEL, and backslashes. This is policy hardening, not evidence of an active-scheme XSS bypass. HTTP(S), fragments and ordinary relative URLs are preserved.

`tests/rich-text-browser.mjs` runs the real sanitizer/restorer in isolated headless Chrome using native DOM parsing, with entity-decoded schemes, control characters, media/script payloads, quote handling and valid href round trips. It is a DOM regression probe, not installed-extension certification.

## Comment mutation ownership

Previously every tab read the same `dm-comments` array, independently modified its snapshot, and replaced the entire key. Concurrent reads could both observe the old array; the last write discarded the other tab's save. Failed reads were interpreted as an empty store and failed writes were silently acknowledged.

`background/comment-store.ts` is now the sole writer. Content scripts submit typed operations over `COMMENT_STORE`; one background-owned promise queue serializes read/modify/write transactions. Each transaction reloads durable storage, and acknowledgement follows successful persistence. Rejected transactions reach the caller without poisoning the queue. The existing storage key and record shape remain unchanged. No permissions, network destinations or storage keys were added.

Operations are scoped by page URL and comment ID. Text edits, resolution and pin offsets modify only their own fields; imports/clear replace only the current page in one transaction. Editing a comment no longer deletes/recreates it, preserving its ID, anchor/region, timestamp and status. The composer retains its draft/region on failure and prevents simultaneous duplicate submissions; delete/resolve failures are surfaced instead of optimistically claiming success. Payload validation rejects malformed records without wiping the existing store.

The queue is not a write-ahead log. Unexpected worker termination or a lost response may leave the caller uncertain whether a commit completed. An already-committed identical-ID add is idempotent, but the UI is not an exactly-once protocol across arbitrary disconnects. Native browser worker suspension/restart and real cross-tab message delivery still need installed-extension testing.

## Checks

- `npm run test:extension`: 124 tests pass, including delayed mocked-storage concurrency, interleaved field updates, cross-page replacement/deletion, read/write failures, failed import, queue recovery, owner recreation, content-client error propagation and composer retry behavior.
- `node packages/extension/tests/rich-text-browser.mjs`: native Chrome DOM probe passes.
- All three extension bundles build; isolated-dist `web-ext lint` reports 0 errors, 0 notices and 34 warnings.
- Typecheck exits 2. A compiler-host comparison against local `main` reports 30 diagnostics before and after, with no new diagnostics (diagnostic spans and messages compared, normalizing union-member display ordering). No claim of full typecheck or repo-wide certification.
- Build caveat: the repository's `build.mjs` automatically linked this worktree's `dist` to the main checkout and the first build wrote generated artifacts there. The link was removed locally, and the final bundles were rebuilt into this worktree's own `dist` using the same three Vite entries. No main-checkout source was edited.

The PR69 selector correction is deliberately untouched.
