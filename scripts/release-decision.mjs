import { compareSemver, parseSemver } from './release-preflight.mjs';

export function decideRelease({
  eventName,
  refType,
  refName,
  version,
  previousVersion,
  tags,
  headSha,
  tagCommits,
}) {
  const list = (tags || []).map((tag) => String(tag).trim()).filter(Boolean);

  if (refType === 'tag') {
    const parsed = parseSemver(refName);
    if (!parsed) {
      return {
        release: false,
        tag: '',
        error: true,
        summary: `Tag ${refName} is not vMAJOR.MINOR.PATCH.`,
      };
    }
    const tag = `v${parsed.version}`;
    return {
      release: true,
      tag,
      error: false,
      summary: `${tag} was pushed by hand. This run publishes it when that tag has no GitHub Release yet.`,
    };
  }

  const parsed = parseSemver(version);
  if (!parsed) {
    return {
      release: false,
      tag: '',
      error: true,
      summary: `Root package.json version is not MAJOR.MINOR.PATCH: ${version}`,
    };
  }

  const releases = list.map((tag) => parseSemver(tag)).filter(Boolean).sort(compareSemver);
  const latest = releases.length ? releases[releases.length - 1].version : null;
  const tag = `v${parsed.version}`;
  if (list.includes(tag)) {
    const tagged = tagCommits?.[tag] || '';
    if (!headSha || !tagged) {
      return {
        release: false,
        tag,
        error: true,
        summary: `${tag} exists, but its commit could not be compared with ${headSha || 'HEAD'}. Nothing was pushed.`,
      };
    }
    if (tagged !== headSha) {
      return {
        release: false,
        tag,
        error: true,
        summary: `${tag} already points at ${tagged}, not ${headSha}. The release-tags ruleset blocks moving or deleting it, so this run does not retag, delete, or force-push. Nothing was published.`,
      };
    }
    return {
      release: false,
      tag,
      error: false,
      summary: `${tag} already points at ${headSha}. Nothing was tagged or published.`,
    };
  }
  if (latest && compareSemver(parsed, parseSemver(latest)) <= 0) {
    return {
      release: false,
      tag,
      error: false,
      summary: `package.json is ${parsed.version}, which is not newer than the latest release ${latest}. Nothing was tagged or published.`,
    };
  }
  if (eventName === 'push' && previousVersion != null && previousVersion === parsed.version) {
    return {
      release: false,
      tag,
      error: false,
      summary: `package.json is still ${parsed.version}, unchanged by this push to main. Nothing was tagged or published.`,
    };
  }
  return {
    release: true,
    tag,
    error: false,
    summary: `${tag} is newer than ${latest ?? 'every existing tag'}. Preflight will run, then the tag is pushed and this run publishes it.`,
  };
}
