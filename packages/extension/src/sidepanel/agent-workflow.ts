// ============================================================
// Design Mode — agent workflow command
// ============================================================
//
// Single source of truth for the `/design-mode` slash-command / workflow
// file we hand to coding agents. The body is tool-agnostic (it drives the
// live MCP tools, not files), so the same text works for Claude Code,
// Cursor, Codex, and Windsurf — only the install path differs.

export const AGENT_COMMAND_MARKDOWN = `---
description: Apply the user's Design Mode edits and resolve their comments
---

# Design Mode

Turn the visual edits and comments the user made in the Design Mode browser
extension into real code changes. Design Mode exposes these over its MCP
server — drive them live; do not look for task files on disk.

## Tools (Design Mode MCP server)
- \`get_session_summary\` — health check; confirm the extension is connected.
- \`get_changes\` — design-token / style / text / DOM changes plus pinned
  comments. The \`items\` array gives every entry a stable \`id\` for status
  updates. Each comment has an \`id\`, a \`selector\`, and — for region
  comments — a \`region\` box ({x,y,w,h} in document pixels) instead of an
  element. \`tokenChanges\` lists CSS custom properties the user redefined,
  each with the \`scopeSelector\` it's declared on. A \`handoff\` field means
  the user explicitly pressed "Send to Agent".
- \`get_screenshot\` — capture a \`selector\`, \`elementId\`, or region for
  visual context.
- \`export_changes\` — emit the edits as CSS / Tailwind / SCSS / JSX.
- \`apply_changes\` — push a CSS tweak back to the live page for preview.
- \`set_change_status\` — flip change \`id\`s to \`in_progress\` / \`resolved\`
  as you work; the user's Changes tab updates live.
- \`mark_comment_resolved\` — mark a comment done (pass its \`id\`).

## Workflow
1. Call \`get_session_summary\`. If the extension isn't connected, ask the
   user to open the Design Mode side panel, then stop.
2. Call \`get_changes\`. Build a task list from the token/style/text/DOM
   changes and the comments.
3. For each item:
   - Call \`set_change_status\` with \`{ status: 'in_progress', ids: [id] }\`
     so the user sees a WIP badge on the row you're working.
   - Map the \`selector\` to its source in the codebase. Reference files as
     \`path:line\`.
   - For a comment, read its \`text\`; for a region comment, call
     \`get_screenshot\` with the region first so you can see the area.
   - For a \`tokenChanges\` entry, find where that token is defined in the
     codebase (SCSS variable, theme file, Tailwind \`@theme\` block, or the
     CSS rule matching its \`scopeSelector\`) and change the definition —
     never inline the new value on components.
   - Implement the change. Prefer existing design tokens / CSS variables and
     \`rem\` over hardcoded \`px\`. A style change whose \`newValue\` is
     \`var(--x)\` means the element should reference that token, not the
     literal it resolves to. A \`tokenChanges\` entry means the token's own
     definition should change at the source. Match the surrounding code's
     conventions.
   - Once shipped, call \`set_change_status\` with \`{ status: 'resolved',
     ids: [id] }\` — the row gets struck through in the user's Changes tab.
     For a comment, call \`mark_comment_resolved\` with its \`id\` instead.
4. Summarise what you changed and which comments you resolved.

## Processing modes (ask the user if unspecified)
- **step** — one item at a time; confirm with the user between each.
- **batch** — group related items; one confirmation per group.
- **yolo** — apply everything autonomously (use with care).
`;

export interface AgentTool {
  key: 'claude' | 'cursor' | 'codex' | 'windsurf';
  label: string;
  path: string;
}

// Where each tool expects the command file. Copy the body, save it here.
export const AGENT_TOOLS: AgentTool[] = [
  { key: 'claude', label: 'Claude Code', path: '.claude/commands/design-mode.md' },
  { key: 'cursor', label: 'Cursor', path: '.cursor/commands/design-mode.md' },
  { key: 'codex', label: 'Codex', path: '.codex/prompts/design-mode.md' },
  { key: 'windsurf', label: 'Windsurf', path: '.windsurf/workflows/design-mode.md' },
];
