import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const keys = ['DM_POSTHOG_HOST', 'DM_POSTHOG_KEY', 'DM_DISTRIBUTION'];

export function analyticsBuildEnv(directory, env = process.env) {
  let source;
  try {
    source = readFileSync(resolve(directory, '.env.analytics.local'), 'utf8');
  } catch {
    throw new Error('Cannot read packages/extension/.env.analytics.local');
  }
  const config = {};
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^\s*(DM_POSTHOG_HOST|DM_POSTHOG_KEY|DM_DISTRIBUTION)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || Object.hasOwn(config, match[1])) {
      throw new Error(`Invalid analytics configuration at line ${index + 1}`);
    }
    let value = match[2];
    if (/^["']/.test(value)) {
      if (value.length < 2 || value.at(-1) !== value[0]) {
        throw new Error(`Invalid analytics configuration at line ${index + 1}`);
      }
      value = value.slice(1, -1);
    }
    config[match[1]] = value;
  }
  for (const key of keys) {
    if (env[key] !== undefined) config[key] = env[key];
  }
  try {
    const host = new URL(config.DM_POSTHOG_HOST);
    if (host.protocol !== 'https:' || host.username || host.password || host.search || host.hash || host.pathname !== '/') throw new Error();
  } catch {
    throw new Error('Invalid DM_POSTHOG_HOST: expected an HTTPS ingestion origin');
  }
  if (!/^phc_[A-Za-z0-9_-]{8,200}$/.test(config.DM_POSTHOG_KEY || '')) {
    throw new Error('Invalid DM_POSTHOG_KEY: expected a public PostHog project token');
  }
  config.DM_DISTRIBUTION ??= 'unknown';
  if (!['unknown', 'fork', 'published_hint', 'unpublished_hint'].includes(config.DM_DISTRIBUTION)) {
    throw new Error('Invalid DM_DISTRIBUTION: expected a supported distribution label');
  }
  return { ...env, ...config };
}
