# Design Mode local agent CLI

Proposed package name: `@designmode/cli`. The scope is not confirmed. This
package is private to prevent accidental publication; `npm pack` works locally.

## Build and try

From the repository root, after installing workspace dependencies:

```sh
npm run build --workspace @designmode/cli
node packages/cli/dist/cli.cjs --help
node packages/cli/dist/cli.cjs tools
node packages/cli/dist/cli.cjs schema apply_changes
node packages/cli/dist/cli.cjs status
node packages/cli/dist/cli.cjs call get_session_summary
printf '%s' '{"format":"css"}' | node packages/cli/dist/cli.cjs call export_changes --stdin
npm pack --workspace @designmode/cli
```

Install the resulting local tarball with `npm install /path/to/designmode-cli-0.1.0.tgz`
then use `design-mode`. No registry publication or global install is needed.
The tarball bundles the existing local MCP engine and SDK; it has no runtime
workspace dependencies. Build from the monorepo, not from an unpacked tarball.

## Connection and safety

Discovery and schemas work offline. Invocation attaches to the **existing**
loopback owner bridge, default port 9960 (`DM_PORT` overrides it). Start
`design-mode-mcp` through your MCP client as before, open the Design Mode
extension and select **Local** mode. The CLI does not start a temporary bridge,
spawn a browser, replace an owner, switch extension settings, or support Cloud.
The existing MCP stdio entry and setup/doctor commands are unchanged.

`status` reports only allowlisted fields, never the bridge authentication token.
Only `get_session_summary` is callable when the bridge is running but the
extension is offline. Other calls fail without dispatch rather than returning
empty local state or pretending a browser operation succeeded. Tools can mutate
the page/session: inspect `schema` first. The CLI performs no automatic retries.
A timeout does not imply rollback; inspect state before retrying a mutation.

Supply arguments only through `--stdin` (a JSON object, maximum 1 MB), not argv.
Avoid logging sensitive tool input/output. Tool results preserve MCP content
blocks, including base64 image content. Errors do not echo malformed input.

## JSON and exit codes

Help is plain text. Every other command emits one JSON object on stdout:
`{ok, tools}`, `{ok, tool}`, `{ok, tool, result}`, a status object, or
`{ok:false,error:{code,message}}`. `result` is the unmodified MCP tool result.
MCP schema validation failures use `result.isError` and a nonzero exit status.

- `0`: success (for status, both bridge and extension connected)
- `1`: MCP/tool/transport failure
- `2`: usage, invalid JSON/port, or unknown tool
- `3`: bridge unavailable or not a recognised Design Mode owner
- `4`: extension offline

Tool calls have a 30-second deadline. No new external network endpoint is used.
Schemas and validation come from `createMcpServer` over the SDK's in-memory
client/server transport; execution delegates to `proxyToolCall`. There is no
second tool registry or implementation.

## Verification

```sh
npm test --workspace @designmode/cli
npm run typecheck --workspace @design-mode/mcp-local
npm run build --workspace @design-mode/mcp-local
npm test --workspace @design-mode/mcp-local
```

The CLI tests exercise the built entry, real local bridge, disconnected states,
MCP schema validation, and an unpacked npm tarball outside workspace resolution.
They do not claim real-browser acceptance. The root workspace lockfile must be
updated by the integrator for this new package and esbuild build dependency.
