# F08/F10 correction evidence

## Scope

Seeded `packages/extension` from the integration worktree, including tracked modifications and non-ignored untracked files, before editing. Seed snapshot: `184eb12`. Apply only the subsequent correction commit, not the seed commit.

- Page Delete, toolbar Delete and Cut use one grouped deletion command. Successful deletion clears redo, deselects and publishes the existing `CHANGES_UPDATE` message.
- Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z with page focus dispatch the same undo/redo message implementation. Input/contenteditable and composition guards preserve native editing.
- Deletion undo retains the original nodes, sibling positions and listeners, restores tracker changes (including canceled clone creation/edits), and persists the restored tracker. Nested multi-delete is one history entry.
- Preview disables both managed style sheets, reverses DOM changes at recorded origins, detaches additions, and restores original text/attributes. Its targeted reverse journal retains edited child nodes/listeners and actual deleted nodes when available. Repeated preview/restore is idempotent.
- Clear, import, disable and deletion/history actions restore the edited view before proceeding, so a preview journal does not leak into those operations. Import failure restores the existing preview through its existing transaction journal.
- `comments.ts`, `helpers.ts`, tracker implementation and import validation/security policy are unchanged. The existing test harnesses only gained the named handler/helper dependencies required by this correction.

## Executed checks

From the isolated worktree root:

```sh
node packages/extension/tests/preview-delete-browser.mjs
TSX_TSCONFIG_PATH=packages/extension/tsconfig.json node --import tsx --test packages/extension/src/**/*.test.ts
node packages/extension/tests/import-security-browser.mjs
npm run build --workspace=@design-mode/extension
git diff --check
```

- **49/49 rendered Chromium component assertions:** actual source-extracted message cases, shortcut registration and history handler; actual shortcut keydown dispatcher, DOM/CSSOM, token store and tracker. Includes Delete → synthetic Cmd+Z, Ctrl+Z, listener identity, redo invalidation/no-op preservation, toolbar parity, grouped nested undo, clone cancellation restoration, tokens/property paint, cross-parent movement, nested deleted parents/children, insertion removal, persisted-delete reconstruction, repeated restore, missing parents, stale redo, typing guards, and early/late preview rollback.
- **145/145 extension Node tests passed.** An initial invocation without `TSX_TSCONFIG_PATH` failed shared-path resolution; the command above is the corrected invocation.
- **118/118 import-security browser checks passed in each of three modes:** native promise API, Chrome polyfill/local storage, Chrome polyfill/session storage.
- **Extension production build passed** for content/background/sidepanel. Verified `packages/extension/dist` is not a symlink and resolves inside this isolated worktree before building. No primary dist writes.
- **Diff whitespace check passed.**
- **Red controls:** `BASELINE_REF=184eb12` fails `page Delete records undo`; `BASELINE_REF=184eb12 PREVIEW_ONLY=1` fails `preview reverses move/delete/insertion with nested origin`, with deleted B appended to body in rendered output.
- **Typecheck remains blocked:** repository `tsc --noEmit` reports shared declaration outputs and existing typing errors. Compiler-host comparison of seeded versus corrected `index.ts` reported 30 baseline diagnostics, 29 current diagnostics, and **zero new diagnostics** (diagnostic file/code/message comparison).

## Boundaries and remaining acceptance

This is component-browser evidence, not installed-extension or full feature certification. Extension messaging/storage, selection/overlay/pin functions are fixture seams; key events are synthetic. No Firefox, physical OS key delivery, packaged installation, permission prompts or background lifecycle was tested here.

Nodes that were already absent when this session loaded can only be reconstructed from their validated saved HTML; their original JavaScript listeners cannot be recovered. A missing/ambiguous origin fails preview with rollback instead of appending at an invented body location.

Deletion undo/redo refuses changed locations or intervening unstacked changes to other tracked elements rather than overwriting newer work with the tracker snapshot. This is a conservative failure boundary, not a concurrent-edit merge implementation. Storage durability retains the existing tracker's persistence/error contract.

No push, publication or remote state change occurred. CodeGraph hook installation was not performed because the task restricts writes to this isolated worktree and the common Git hook directory is outside it. Review was direct, not an independent delegated review (the task prohibited recursion).
