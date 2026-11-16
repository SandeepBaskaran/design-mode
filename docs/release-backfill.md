# GitHub Release backfill — 16 November 2026

Checked with `git tag -l 'v*'`, `gh release list`, and `gh api repos/SandeepBaskaran/design-mode/releases`. Release bodies were compared with the matching `## [x.y.z]` section in `CHANGELOG.md`. The website list is `website/src/content/changelog.ts`.

No `gh release create` command is listed. Every existing `v*` tag already has a GitHub Release, and this file does not publish anything.

## Tags and releases

These tags exist and each has a non-draft GitHub Release: `v1.0.2`, `v1.1.0`, `v1.2.0`, `v1.3.0`, `v1.4.0`, `v1.5.0`, `v1.6.0`, `v1.7.0`, `v1.7.1`, `v1.8.0`, `v1.9.0`, `v2.0.0`, `v2.1.0`, `v2.2.0`, `v2.2.1`, `v2.3.0`, `v2.3.1`, `v3.0.0`, `v3.0.1`, `v3.0.2`, `v3.1.0`, `v3.2.0`, `v3.2.1`, `v3.2.2`.

There is no tag with a missing GitHub Release.

`v3.2.2` is marked Latest. Its release name is `v3.2.2`. The only release whose name is not exactly the tag is `v1.0.2 — Effects refactor, Layout Guide, Motion split, security hardening`.

## Where the notes differ

- `v1.0.2`: the GitHub Release is a short highlight (Effects, Motion, Layout guide). `CHANGELOG.md` for 1.0.2 is the full Added / Changed / Fixed / Security section and does not match that body. The website entry is a one-line summary of Stroke, Effects, Motion and Layout guides. It does not contradict the changelog; it omits the rest.
- `v2.2.1`: the GitHub Release says Chrome restores the launch surface through the action or keyboard gesture callback after a service-worker cold start, so Alt+D can open the side panel. The `CHANGELOG.md` bullet drops the clause “gesture callback after a service-worker cold start, so `Alt+D` can open the”. The website highlights still describe that Alt+D behaviour and that Floating / Pin on top do not flash the docked panel. The website entry was left as-is because it matches the GitHub Release, not the shorter changelog line.
- Every other tagged version from 1.1.0 through 3.2.2: the GitHub Release body matches the `CHANGELOG.md` section after the heading (whitespace-normalised).

## Versions with no tag

`1.0.1` is in `CHANGELOG.md` (2026-05-04) and on the website (“First public release.”). There is no `v1.0.1` tag and no GitHub Release. `gh release create v1.0.1 --verify-tag` cannot succeed until that tag exists.

Do not push a `v1.0.1` tag to create one. `.github/workflows/release.yml` runs on `push` of tags matching `v*.*.*`. A new tag push is a release workflow, not a notes-only backfill.

`[Unreleased]` in `CHANGELOG.md` has no tag and no release. That is expected.

## Website changelog

`website/src/content/changelog.ts` lists the same versions as `CHANGELOG.md`, including 1.0.1, with the same dates. It is a short highlight list, not a copy of every changelog bullet. No website entry was changed in this pass.

## Would creating a Release on an old tag start a workflow?

No workflow in `.github/workflows` listens for a `release` event.

`release.yml` starts on:

- a push to `main`
- a push of a tag matching `v*.*.*`
- Actions → Release → Run workflow, and only from `main`

`ci.yml` starts on a push to `main` and on pull requests. `codeql.yml` starts on a push to `main`, pull requests, and a weekly schedule. `stale.yml` is scheduled.

`gh release create <existing-tag> --verify-tag` attaches notes to a tag that is already on the remote. It does not push a tag and it does not match those `on:` blocks. Creating a Release for `v1.0.2` through `v3.2.2` would edit an existing release, not fill a missing one, so no command is prepared.
