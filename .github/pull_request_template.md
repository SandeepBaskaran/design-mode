## Summary

<!-- One or two sentences: what does this PR change and why? -->

## Scope

<!-- Tick all that apply. -->

- [ ] `packages/extension` (Chrome extension)
- [ ] `packages/mcp-local`
- [ ] `packages/mcp-cloud`
- [ ] `packages/shared`
- [ ] `website/`
- [ ] Documentation (`*.md`)
- [ ] Build / tooling

## Related issue

<!-- "Closes #123" or "Refs #123". Leave blank if there's no issue. -->

## Test plan

<!--
For extension UI changes, "type-checks" is not enough — manual repro
in Chrome is expected.
-->

- [ ] `npm run verify` succeeds locally (CI also runs this — see ci.yml)
- [ ] Manual smoke test in Chrome against the test fixture or a real site
- [ ] Relevant E2E rows in `docs/e2e-testcases.md` updated / pass

## Checklist

- [ ] I've read [CONTRIBUTING.md](../blob/main/CONTRIBUTING.md)
- [ ] No new outbound network calls (or, if there are, they're opt-in
      and added to PRIVACY.md)
- [ ] No new manifest permissions (or, if there are, the rationale is
      in the PR description)
- [ ] No `eval`, `new Function`, or inline event handlers
- [ ] Page-derived strings sanitized — `sanitizeRichTextHtml` /
      `escapeAttr` / `safeCssColor` as appropriate
- [ ] No secrets in the diff
- [ ] No version bumps in this PR (bumps are a release event)

## Screenshots / recordings

<!-- For UI changes. Drag files directly into this box. -->
