import { compareSemver, parseSemver } from './release-preflight.mjs';

export function decideRelease({
  eventName,
  refType,
  refName,
  version,
  previousVersion,
  tags,
  githubReleaseExists,
}) {
  const list = (tags || []).map((tag) => String(tag).trim()).filter(Boolean);

  if (refType === 'tag') {
    const parsed = parseSemver(refName);
    if (!parsed) {
      return {
        release: false,
        createTag: false,
        tag: '',
        error: true,
        summary: `Tag ${refName} is not vMAJOR.MINOR.PATCH.`,
      };
    }
    const tag = `v${parsed.version}`;
    return {
      release: true,
      createTag: false,
      tag,
      error: false,
      summary: `${tag} was pushed by hand. This run publishes it when that tag has no GitHub Release yet.`,
    };
  }

  const parsed = parseSemver(version);
  if (!parsed) {
    return {
      release: false,
      createTag: false,
      tag: '',
      error: true,
      summary: `Root package.json version is not MAJOR.MINOR.PATCH: ${version}`,
    };
  }

  const releases = list.map((tag) => parseSemver(tag)).filter(Boolean).sort(compareSemver);
  const latest = releases.length ? releases[releases.length - 1].version : null;
  const tag = `v${parsed.version}`;
  if (list.includes(tag)) {
    if (typeof githubReleaseExists !== 'boolean') {
      return {
        release: false,
        createTag: false,
        tag,
        error: true,
        summary: `Could not check whether ${tag} has a GitHub Release. Nothing was pushed.`,
      };
    }
    if (githubReleaseExists) {
      return {
        release: false,
        createTag: false,
        tag,
        error: false,
        summary: `${tag} already has a GitHub Release. Nothing was tagged or published.`,
      };
    }
    if (eventName === 'workflow_dispatch') {
      return {
        release: true,
        createTag: false,
        tag,
        error: false,
        summary: `${tag} exists and has no GitHub Release. This run publishes that tag from its own commit and does not retag.`,
      };
    }
    return {
      release: false,
      createTag: false,
      tag,
      error: false,
      summary: `${tag} exists without a release; run Release manually to finish it.`,
    };
  }
  if (latest && compareSemver(parsed, parseSemver(latest)) <= 0) {
    return {
      release: false,
      createTag: false,
      tag,
      error: false,
      summary: `package.json is ${parsed.version}, which is not newer than the latest release ${latest}. Nothing was tagged or published.`,
    };
  }
  if (eventName === 'push' && previousVersion != null && previousVersion === parsed.version) {
    return {
      release: false,
      createTag: false,
      tag,
      error: false,
      summary: `package.json is still ${parsed.version}, unchanged by this push to main. Nothing was tagged or published.`,
    };
  }
  return {
    release: true,
    createTag: true,
    tag,
    error: false,
    summary: `${tag} is newer than ${latest ?? 'every existing tag'}. Preflight will run, then the tag is pushed and this run publishes it.`,
  };
}
