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
- \`get_changes\` — style / text / DOM changes plus pinned comments. Each
  comment has an \`id\`, a \`selector\`, and — for region comments — a
  \`region\` box ({x,y,w,h} in document pixels) instead of an element.
- \`get_screenshot\` — capture a \`selector\`, \`elementId\`, or region for
  visual context.
- \`export_changes\` — emit the edits as CSS / Tailwind / SCSS / JSX.
- \`apply_changes\` — push a CSS tweak back to the live page for preview.
- \`mark_comment_resolved\` — mark a comment done (pass its \`id\`).

## Workflow
1. Call \`get_session_summary\`. If the extension isn't connected, ask the
   user to open the Design Mode side panel, then stop.
2. Call \`get_changes\`. Build a task list from the style/text/DOM changes
   and the comments.
3. For each item:
   - Map the \`selector\` to its source in the codebase. Reference files as
     \`path:line\`.
   - For a comment, read its \`text\`; for a region comment, call
     \`get_screenshot\` with the region first so you can see the area.
   - Implement the change. Prefer existing design tokens / CSS variables and
     \`rem\` over hardcoded \`px\`. Match the surrounding code's conventions.
   - After implementing what a comment asked for, call
     \`mark_comment_resolved\` with its \`id\` so the user sees the loop close
     in the Changes tab.
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
