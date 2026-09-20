# Guided local agent setup

Guided setup currently supports **Claude Code** and **Cursor**, using project-local configuration only. Other clients can keep using MCP → Copy config and the workflow download. No published package is required.

From the Design Mode repository, install locked dependencies and build the companion:

```sh
npm ci
npm --workspace @design-mode/mcp-local run build
```

Preview the exact files and MCP entry for your application:

```sh
node packages/mcp-local/dist/bin/cli.js setup --project /absolute/path/to/your/app --agent claude-code
```

Use `--agent cursor` for Cursor, or `--agent all` for both. The default is a **dry-run**: nothing is written. When the preview is correct, repeat with `--apply` and confirm the prompt. `--yes` is an explicit non-interactive confirmation, not the default.

| Client | MCP configuration | Workflow command |
|---|---|---|
| Claude Code | `.mcp.json` | `.claude/commands/design-mode.md` |
| Cursor | `.cursor/mcp.json` | `.cursor/commands/design-mode.md` |

Setup merges only the `design-mode` entry, preserves other entries and backs up changed files. Conflicting existing entries require `--force` as well as apply confirmation. Existing environment settings and extra server options are preserved; incompatible HTTP transport fields are removed when switching to the local command. JSONC comments, trailing commas and a BOM are accepted. Changed configurations are normalised to JSON after a preview warning; the backup preserves the original. Malformed input and symlink targets are rejected instead of overwritten. Repeating the same setup makes no changes. Preview output excludes unrelated configuration values; backups remain local and should not be committed if they contain secrets.

The installed entry uses absolute paths to your current Node binary and built companion CLI. Keep that checkout available; rerun setup if you move it or replace Node. Restart your agent and select **Local** in the extension's MCP page, with the same port (9960 by default).

```sh
node packages/mcp-local/dist/bin/cli.js doctor
```

Doctor checks the built CLI and localhost bridge/extension connectivity. It does not edit configuration or start an agent. Run it after starting your configured MCP client; a missing owner before that is expected. Use `doctor --port <port>` for a customised port.

## Live feedback rounds

Run `/design-mode` in your agent and choose live rounds. The Local tool `wait_for_handoff` waits in bounded calls of at most 20 seconds. The panel shows **Waiting for feedback**, **Implementing**, or **Stopped**. Each Send captures a structured snapshot; later edits are not silently added to that snapshot. The next Send becomes available when the agent returns to waiting.

**Stop** ends the loop and releases a pending wait without clearing your edits. It cannot terminate an already-running command in your coding agent. Stop that command in the agent itself if necessary. Navigation, disconnection and explicit Clear also end the session; a new loop requires a fresh start. Multiple clients cannot claim the same live session simultaneously.

Live rounds are **Local-only** in this version. Cloud and Self-hosted retain their one-shot Send workflow; they do not expose `wait_for_handoff`.
