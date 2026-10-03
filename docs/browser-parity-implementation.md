# Browser parity implementation checkpoint

## Implemented

- Firefox: capability-detected floating editor, Document Picture-in-Picture and launch preferences. Older runtimes retain sidebar fallback.
- Firefox docking: Dock prepares/focuses the target page; the next Design Mode toolbar/command gesture finishes in that window. The source stays alive until an initialised, explicitly target-bound native sidebar acknowledges takeover. Unpin, source/target closure and tab movement cancel pending handoffs.
- Shared colour picker: native EyeDropper where callable; otherwise an explicitly labelled viewport snapshot sampler in the existing editor. Keyboard cursor, pixel/hex feedback, cancellation, permission errors and stale-target guards included. This is not a screen-wide eyedropper.
- Safari Inspector: synchronous promised-text clipboard reservation for Copy as Prompt and panel-focused Export CSS. Oversized bridge responses return actionable errors rather than silently timing out.
- Safari remains Inspector-only. No in-page editor, native companion or new floating surface was added.

## Combined verification

- `DM_ISOLATED_BUILD=1 npm run verify`: all 19 automated gates passed.
- `DM_ISOLATED_BUILD=1 npm run test:extension`: 475 passed, no failures/skips.
- Chrome/Firefox shared packages and separate Safari package built; ZIP entries and bytes verified against their build directories. Chrome and Firefox archives are byte-identical.
- Final combined bundles exercised in disposable installed Firefox 156: repeated floating/PiP transfers, concurrent reopen, unpin/close cancellation, moved target, explicit-target edit isolation and target closure passed.
- Final combined bundles exercised in installed Chrome for Testing 153: real capture request, pixel selection, style application and computed-style readback passed. Native EyeDropper dispatch used a controlled API result; OS picker UI was not automated.

## Remaining inspection / certification

- Native Safari verification of the new sampler and text clipboard paths remains outstanding. Automated bridge/clipboard tests are not Safari runtime certification. Earlier user acceptance covered the pre-parity Inspector lifecycle.
- Firefox page sampler still needs native Firefox coverage; its shared implementation was runtime-tested in Chrome.
- Safari local `file://` eligibility remains deliberately restricted pending demonstrated injection/permission support; localhost HTTP(S) is the alternative.
- Safari native extension sidebar and Document PiP remain unavailable through the APIs assessed. New alternative surfaces were explicitly excluded by the user.
- Live end-to-end Safari Cloud MCP certification remains outstanding; repository MCP regression gates are not equivalent evidence.
- Normal signed Safari distribution, older-browser native runs and exhaustive accessibility/feature parity are not claimed.

Changes remain uncommitted in the user-selected `feat/safari-extension` worktree. No release, push or publication occurred. Child worktrees/evidence remain available while native certification is unfinished.
