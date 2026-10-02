import { constants } from 'node:fs';
import { open } from 'node:fs/promises';

export const CLOUD_ENDPOINT = 'https://mcp.designmode.app/api/mcp';
export type Mode = 'cloud' | 'local' | 'self-hosted';
export class CliError extends Error {
  constructor(readonly code: string, message: string, readonly exitCode = 2) { super(message); }
}

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function fields(value: unknown, allowed: string[]): asserts value is Record<string, unknown> {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) {
    throw new CliError('INVALID_CONFIG', 'Configuration contains unsupported fields or an invalid object.');
  }
}
export function endpoint(value: unknown): URL {
  try {
    if (typeof value !== 'string') throw new Error();
    const url = new URL(value);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
      url.pathname !== '/api/mcp') throw new Error();
    return url;
  } catch {
    throw new CliError('INVALID_ENDPOINT', 'Self-hosted endpoint must be HTTPS /api/mcp, without credentials, query or fragment. HTTP is allowed only on localhost, 127.0.0.1 or [::1].');
  }
}

export async function loadConfig(selectedMode?: string, env = process.env) {
  let config: Record<string, unknown> = {};
  if (env.DM_CONFIG) {
    try {
      const file = await open(env.DM_CONFIG, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const stat = await file.stat();
        if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 ||
          (process.getuid && stat.uid !== process.getuid()) || stat.size > 65_536) throw new Error();
        const bytes = Buffer.alloc(65_537);
        const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
        if (bytesRead > 65_536) throw new Error();
        config = JSON.parse(bytes.subarray(0, bytesRead).toString('utf8'));
      } finally { await file.close(); }
    } catch {
      throw new CliError('INVALID_CONFIG', 'DM_CONFIG must name an owned, regular, non-symlink JSON file with permissions 0600 (maximum 64 KiB).');
    }
  }
  fields(config, ['mode', 'cloud', 'selfHosted']);
  if (config.cloud !== undefined) fields(config.cloud, ['token']);
  if (config.selfHosted !== undefined) fields(config.selfHosted, ['endpoint', 'token']);
  const mode = selectedMode ?? env.DM_MODE ?? config.mode ?? 'cloud';
  if (!['cloud', 'local', 'self-hosted'].includes(mode as string)) {
    throw new CliError('INVALID_MODE', 'Mode must be cloud, local or self-hosted.');
  }
  const deadline = env.DM_TIMEOUT_MS ?? '30000';
  if (!/^\d+$/.test(deadline) || Number(deadline) < 100 || Number(deadline) > 120_000) {
    throw new CliError('INVALID_TIMEOUT', 'DM_TIMEOUT_MS must be an integer from 100 to 120000 (remote commands only).');
  }
  if (mode !== 'self-hosted' && env.DM_ENDPOINT) {
    throw new CliError('INVALID_CONFIG', 'DM_ENDPOINT is only accepted in self-hosted mode. Cloud uses its canonical endpoint.');
  }
  const profile = mode === 'cloud' ? config.cloud : config.selfHosted;
  const token = mode === 'local' ? undefined :
    (mode === 'cloud' ? env.DM_CLOUD_TOKEN : env.DM_SELF_HOSTED_TOKEN) ?? (object(profile) ? profile.token : undefined);
  if (mode !== 'local' && (typeof token !== 'string' || !/^[A-Za-z0-9_\-.~+/=]{1,4096}$/.test(token))) {
    throw new CliError('MISSING_CREDENTIAL', 'Set the selected mode credential through DM_CLOUD_TOKEN / DM_SELF_HOSTED_TOKEN or its protected DM_CONFIG profile. Credentials are never accepted in argv.');
  }
  const url = mode === 'self-hosted'
    ? endpoint(env.DM_ENDPOINT ?? (object(profile) ? profile.endpoint : undefined))
    : new URL(CLOUD_ENDPOINT);
  return { mode: mode as Mode, token: token as string | undefined, url, timeout: Number(deadline) };
}
