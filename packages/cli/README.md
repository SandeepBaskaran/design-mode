# Design Mode agent CLI

Package: **`@designmode-app/cli`**. Executable: **`designmode-app`**.
Cloud is the default; Local and Self-hosted use the same existing MCP contracts.
Version 3.0.0 is published to npm under the `designmode-app` organisation.

## Build and try locally

From the repository root with workspace dependencies installed:

```sh
npm run build --workspace @designmode-app/cli
node packages/cli/dist/cli.cjs --help
node packages/cli/dist/cli.cjs --mode local tools
npm pack --workspace @designmode-app/cli
```

Install the resulting tarball with `npm install /path/to/designmode-app-cli-3.0.0.tgz`
and use `designmode-app`. The executable bundles its dependencies and existing
Local MCP engine; it does not import a workspace at runtime. Build from the
monorepo, not from an unpacked tarball. Node 18 or newer is required.

One-off usage is `npx @designmode-app/cli@3.0.0 --help`, or install with
`npm install -g @designmode-app/cli`. Pin a tested version for durable setups.
`npx` may download the package into npm's cache.

## Select a mode and configure credentials

Mode precedence: leading `--mode` → `DM_MODE` → config `mode` → **Cloud**.
Commands do not change extension settings. Select the corresponding mode in
the browser extension and use the bearer token for that same relay/tenant.

| Mode | Transport and configuration |
| --- | --- |
| **Cloud** (default) | SDK Streamable HTTP at `https://mcp.designmode.app/api/mcp`; credential in `DM_CLOUD_TOKEN` or config `cloud.token`. The endpoint cannot be overridden. |
| **Local** | Existing loopback owner bridge, `DM_PORT` (default `9960`). Start `design-mode-mcp` through your MCP client. This CLI never starts or replaces the owner. No remote token is needed. |
| **Self-hosted** | SDK Streamable HTTP at the full `/api/mcp` URL in `DM_ENDPOINT` or config `selfHosted.endpoint`; credential in `DM_SELF_HOSTED_TOKEN` or config `selfHosted.token`. |

Self-hosted requires HTTPS for remote servers. HTTP is allowed only for literal
`localhost`, `127.0.0.1` and `[::1]`, for a relay running on your own machine.
Do not use untrusted local relays. URL credentials, query strings, fragments
and all redirects are rejected. `DM_ENDPOINT` is rejected outside Self-hosted
mode so it cannot silently change the destination of a Cloud credential.
Cloud and Self-hosted credentials are separate and never fall back to each other.

**Never pass tokens as command-line arguments or paste them into shell history.**
Supply them through your environment/secret manager, or use a protected config
file. The CLI does not read a default credential file: explicitly set `DM_CONFIG`
to your file's path. The file must be owned by the current user, be a regular
non-symlink file with permissions **0600**, and contain at most 64 KiB of JSON.
Create it in a private directory outside the repo using a trusted editor; set
`chmod 600 /path/to/config.json` before using it. Shape (placeholders, not tokens):

```json
{
  "mode": "cloud",
  "cloud": { "token": "REPLACE_IN_PRIVATE_FILE" },
  "selfHosted": {
    "endpoint": "https://your-relay.example/api/mcp",
    "token": "REPLACE_IN_PRIVATE_FILE"
  }
}
```

Omit unused profiles. Environment variables override the corresponding profile.
The CLI reads configuration but never creates, rewrites or prints credentials.
Unknown config fields are errors; `--help` reads no config and makes no network
requests, even with a broken config. No-argument invocation also prints help.

## Commands

Once the selected mode is configured:

```sh
designmode-app tools
designmode-app schema apply_changes
designmode-app status
designmode-app call get_session_summary
printf '%s' '{"format":"css"}' | designmode-app call export_changes --stdin
designmode-app --mode local status
```

- `tools` / `schema`: Cloud and Self-hosted connect and discover schemas from
  **that server**, including paginated tool lists. Local discovery is offline
  through the existing MCP registry. Tool sets can differ between modes.
- `status`: remote modes verify authenticated relay initialization and discovery,
  **not browser connectivity** (`extensionConnected: null`). Request browser
  state with `call get_session_summary`; this consumes a relay tool call/quota.
  Local status reports the existing bridge and extension connection state.
- `call`: invokes a discovered tool once. Optional `--stdin` reads a JSON object,
  maximum 1 MB; absent stdin uses `{}`. Tool definitions and execution remain in
  the existing server, not a second CLI tool engine. Remote argument validation
  is the server's responsibility; discovery alone is not validation.

Remote commands require credentials even for discovery. They can update relay
agent presence/last-seen metadata. Help is offline; it never silently contacts
Cloud. Local allows only `get_session_summary` when the owner is running but
the extension is offline; other calls fail before dispatch.

## Safety, output and deadlines

Tool calls may mutate the page/session. Inspect schemas first. There are **no
automatic retries**, OAuth/login flows, redirect following, browser launches,
or production account changes. Remote commands have a total 30-second deadline
across initialization, discovery and invocation. Set `DM_TIMEOUT_MS` from `100`
to `120000` to change it. Local tool calls retain their 30-second deadline.
The deadline begins after stdin is read. A timeout/disconnection does **not**
mean rollback: a mutation may already have happened. Inspect state before retrying.

All commands except help emit one JSON object. Tool results preserve MCP content
blocks, including images; occurrences of the selected remote credential are
redacted. Transport/config errors do not echo raw exceptions, response bodies,
endpoints or malformed input. Tool output can still contain sensitive page data;
do not log it indiscriminately. No telemetry is added.

| Exit | Meaning |
| --- | --- |
| `0` | Success; remote status means relay reachable, not browser attached |
| `1` | MCP/tool/transport/auth failure or remote timeout |
| `2` | Usage/config/input error or unknown tool |
| `3` | Local bridge unavailable / unrecognized owner |
| `4` | Local extension offline |

## Verification and limits

```sh
npm test --workspace @designmode-app/cli
npm run typecheck --workspace @designmode-app/cli
npm run build --workspace @design-mode/mcp-local
npm run typecheck --workspace @design-mode/mcp-local
npm test --workspace @design-mode/mcp-local
```

Tests run the built executable and exact unpacked npm tarball in all modes.
They exercise the real Local owner bridge and the actual Cloud MCP/auth handlers
with an in-memory Redis fixture and synthetic browser replies. A test-only fetch
preload redirects the fixed Cloud URL to the local fixture and blocks every
other destination; the production CLI has no Cloud-endpoint override. Failures
cover invalid auth, malformed responses, redirect rejection, disconnects,
timeouts, bad config/permissions, schema discovery and secret redaction.
These tests are not production-relay, real-Redis or real-browser certification.

## Published package

`@designmode-app/cli@3.0.0` is public. Later versions still require an explicit
publish from this directory after the version, README and tarball are checked.
Authenticate in the maintainer's terminal, then run `npm publish --access public`.
Do not put tokens or one-time codes in the repository or chat.
