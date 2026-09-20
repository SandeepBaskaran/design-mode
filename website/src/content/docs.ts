export type DocPage = {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  intro: string;
  sections: { heading: string; body: string; code?: string }[];
  related: string[];
};

export const docs: DocPage[] = [
  {
    slug: "install",
    title: "Install Design Mode",
    metaTitle: "Install Design Mode for Chrome or Firefox",
    metaDescription:
      "How to install the Design Mode browser extension in Chrome, Edge, Brave, Arc, or Firefox. Pin the side panel (sidebar on Firefox), open a scriptable webpage (not chrome:// or store pages), start designing. No account required.",
    keywords: [
      "install Design Mode",
      "Design Mode Chrome extension",
      "Design Mode Firefox add-on",
      "install Chrome extension",
      "install Firefox add-on",
      "Edge extension install",
      "Arc browser extension",
    ],
    intro:
      "Install Design Mode from the Chrome Web Store or Firefox Add-ons, open it on a scriptable webpage, and make a local visual edit. No account or MCP setup is required for Copy as Prompt.",
    sections: [
      {
        heading: "1. Install from your browser's store",
        body: "On Chrome, Edge, Brave, Arc, or another Chromium browser, open the Chrome Web Store listing and click Add to Chrome. On Firefox, open the Firefox Add-ons (AMO) listing and click Add to Firefox.",
      },
      {
        heading: "2. Pin the extension",
        body: "Click the puzzle-piece icon in the browser toolbar and pin Design Mode so the side panel is one click away.",
      },
      {
        heading: "3. Open a supported page and click the icon",
        body: "Navigate to your dev server, staging deploy or another webpage that allows extension scripts, then click the Design Mode toolbar icon. Chrome opens the selected Launch surface (Side panel by default, Floating, or a Pin-on-top opener); Firefox opens the native sidebar. Alt+D follows the same choice. Browser-internal pages and extension stores are protected surfaces where no extension can inject the editor.",
      },
      {
        heading: "4. (Optional) Set up MCP for AI agents",
        body: "Use Copy as Prompt without MCP. For direct hand-off, follow the client-specific MCP setup guide. Cloud is selected on a fresh install but stays disconnected until you create a credential; Local requires the companion server.",
      },
    ],
    related: [
      "browser-support",
      "mcp-setup",
      "keyboard-shortcuts",
      "troubleshooting",
    ],
  },
  {
    slug: "browser-support",
    title: "Browser support & parity",
    metaTitle: "Browser support — Chrome, Firefox, and feature parity",
    metaDescription:
      "Design Mode runs on Chrome, Edge, Brave, Arc, and Firefox. What's identical across browsers, and the few Chrome-only features (pop-out window, Picture-in-Picture, screen eyedropper).",
    keywords: [
      "Design Mode browser support",
      "Design Mode Firefox",
      "Firefox add-on",
      "Chrome vs Firefox extension",
      "browser feature parity",
    ],
    intro:
      "Design Mode runs on Chromium browsers (Chrome, Edge, Brave, Arc) and on Firefox 121+. Everything core is identical across browsers; a few extras depend on APIs that only Chromium ships, so they're hidden on Firefox.",
    sections: [
      {
        heading: "Supported browsers",
        body: "Chromium browsers with Manifest V3 side panels — Chrome, Edge, Brave, Arc — install from the Chrome Web Store and render the editor in the right-side panel. Firefox (121+) installs from Firefox Add-ons (AMO) and renders in the native sidebar. Safari is not supported (no MV3 side-panel API). It's a desktop-primary experience.",
      },
      {
        heading: "Identical on every browser",
        body: "The whole editing surface is the same: inspect any element; edit Position, Layout, Typography, Fill, Stroke, Effects, Motion, and Layout Guides; the Layers tree; the Changes tab with export/import; comments; element and viewport screenshots; DOM edits (duplicate, delete, reorder); the design-token engine; and the full MCP / send-to-agent handoff. Firefox always opens its sidebar; Chrome can launch into its side panel or Chrome-only floating surfaces.",
      },
      {
        heading: "Chrome-only features",
        body: "Three extras rely on Chromium-only browser APIs and are hidden on Firefox: the pop-out floating window (needs the side-panel + windows APIs), Picture-in-Picture “pin on top” (needs the Document Picture-in-Picture API), and the screen eyedropper “Pick” button (needs the EyeDropper API). On Firefox, colour entry still works via the HSV picker, the site-token list, and hex/RGB input — only the whole-screen sampler is unavailable.",
      },
      {
        heading: "Firefox specifics",
        body: "Design Mode opens as Firefox's native sidebar rather than a right-docked panel; the toolbar button, the View → Sidebar menu, and Alt+D all toggle it. For local files, Firefox manages file:// access from about:addons (there's no per-extension “Allow access to file URLs” toggle like Chrome's).",
      },
    ],
    related: ["install", "keyboard-shortcuts", "troubleshooting"],
  },
  {
    slug: "keyboard-shortcuts",
    title: "Keyboard shortcuts",
    metaTitle:
      "Keyboard shortcuts — Design Mode side panel shortcuts reference",
    metaDescription:
      "Every keyboard shortcut in Design Mode — inspector, comments, tabs, undo/redo, screenshot, export CSS — including the two browser-level commands you can rebind. Designed for fast iteration without leaving the keyboard.",
    keywords: [
      "Design Mode keyboard shortcuts",
      "design tool shortcuts",
      "Chrome extension shortcuts",
      "keyboard reference",
    ],
    intro:
      "Design Mode has 12 shortcuts that work directly on the page while the side panel is open, plus two browser-level commands for opening the panel and taking a screenshot — 14 in total.",
    sections: [
      {
        heading: "In-page shortcuts",
        body: "These fire on the page itself while the side panel is open: Alt+I toggles Inspect, Alt+C drops a comment pin, Alt+R starts a region comment (drag a rectangle), Alt+P pauses/resumes all motion on the page, and Alt+X copies the exported CSS to your clipboard.",
      },
      {
        heading: "Tabs & selection",
        body: "Alt+1 / Alt+2 / Alt+3 jump to the Layers / Design / Changes tab. Escape deselects back to hover mode. Delete removes the selected element.",
      },
      {
        heading: "Undo & redo",
        body: "Cmd/Ctrl + Z undoes the last style, text, or DOM change. Cmd/Ctrl + Shift + Z redoes it. Every change in the Changes tab is reversible individually too.",
      },
      {
        heading: "Browser-level commands",
        body: "Alt+D opens Design Mode on both Chrome and Firefox; Alt+S takes a screenshot using the same target and destination as the camera button. They are browser commands rather than page handlers, so both can be rebound at chrome://extensions/shortcuts on Chrome or about:addons › Manage Extension Shortcuts on Firefox. Browsers treat the supplied keys as suggestions and may leave either command unassigned after an update or conflict. The 12 in-page shortcuts above cannot be remapped from Settings — that list is read-only.",
      },
    ],
    related: ["install", "changes-tab", "mcp-setup"],
  },
  {
    slug: "mcp-setup",
    title: "MCP setup",
    metaTitle: "MCP setup for Claude Code and Cursor",
    metaDescription:
      "Version-stamped Design Mode MCP setup for Claude Code and Cursor, including Cloud Streamable HTTP and the Local stdio companion server.",
    keywords: [
      "MCP setup",
      "Claude Code MCP setup",
      "Cursor MCP setup",
      "Claude Desktop MCP",
      "Windsurf MCP setup",
      "Cline MCP setup",
    ],
    intro:
      "Choose Copy as Prompt when you do not need a live connection. For MCP, use the client-specific configuration below. These instructions were checked against first-party Claude Code and Cursor documentation on 15 August 2026; client behaviour may change after that date.",
    sections: [
      {
        heading: "1. Choose the hand-off and transport",
        body: "Copy as Prompt needs no connection. Cloud uses the hosted Streamable HTTP endpoint at https://mcp.designmode.app/mcp and a bearer token created in the extension. Local runs the repository's stdio companion server and bridges to the extension on ws://localhost:9960. Concurrent Local clients share one owner on that port; a surviving client takes ownership if the owner closes. Foreign occupants are never killed; DM_PORT selects a fallback port that must match the extension. Self-hosted uses infrastructure you operate.",
      },
      {
        heading: "2. Claude Code — Cloud",
        body: "Claude Code recommends HTTP for remote servers. Add the hosted endpoint at project scope and pass the token as an Authorization header. Keep the real token out of shell history, screenshots and committed files. Claude Code project MCP definitions live in .mcp.json; .claude/settings.json is not the server-definition file.",
        code: [
          "claude mcp add --transport http --scope project \\",
          "  --header 'Authorization: Bearer <token>' \\",
          "  design-mode https://mcp.designmode.app/mcp",
        ].join("\n"),
      },
      {
        heading: "3. Claude Code — Local",
        body: "Clone the repository and install its locked dependencies first. The double dash separates Claude Code options from the stdio command. Use an absolute repository path. Run claude mcp list, claude mcp get design-mode or /mcp to inspect status; a project-scoped server may require workspace approval on first use.",
        code: [
          "claude mcp add --transport stdio --scope project design-mode -- \\",
          "  npm start --prefix /absolute/path/to/design-mode/packages/mcp-local",
        ].join("\n"),
      },
      {
        heading: "4. Cursor — project configuration",
        body: 'Cursor reads project servers from .cursor/mcp.json and global servers from ~/.cursor/mcp.json. It supports stdio, SSE and Streamable HTTP. For Cloud, set url to https://mcp.designmode.app/mcp and pass Authorization in headers; use ${env:DESIGN_MODE_TOKEN} rather than committing the token. For Local, configure command npm with args ["start", "--prefix", "/absolute/path/to/design-mode/packages/mcp-local"]. Cursor asks before MCP tool use by default.',
        code: '{\n  "mcpServers": {\n    "design-mode": {\n      "url": "https://mcp.designmode.app/mcp",\n      "headers": {\n        "Authorization": "Bearer ${env:DESIGN_MODE_TOKEN}"\n      }\n    }\n  }\n}',
      },
      {
        heading: "5. Other MCP clients",
        body: "Claude Desktop, VS Code, Windsurf, Cline and other clients use different files, wrappers, transports and authentication rules. Do not reuse the Claude Code command or Cursor JSON blindly. Use the client's current first-party documentation, select Streamable HTTP for Cloud where supported or stdio for Local, and verify header support before adding a credential.",
      },
      {
        heading: "6. Verify the connection",
        body: "Open Design Mode on a supported page and make one harmless change. Confirm the client reports the eight session tools: get_changes, apply_changes, set_change_status, clear_changes, get_session_summary, export_changes, get_screenshot and mark_comment_resolved. The current repository's Local companion also registers wait_for_handoff for opt-in live feedback rounds; that tool is Local-only, current-repository / unreleased, and not a guaranteed Chrome Web Store or Firefox Add-ons listing capability. Cloud and Self-hosted keep one-shot Send. Call get_session_summary, then get_changes. A green MCP chip proves a client attached; it does not prove the agent updated source code correctly.",
      },
    ],
    related: ["install", "troubleshooting", "changes-tab"],
  },
  {
    slug: "changes-tab",
    title: "The Changes tab",
    metaTitle: "Changes tab — Searchable, exportable design change history",
    metaDescription:
      "Every edit in Design Mode lands in the Changes tab — style, text, DOM, comments. Search, filter by kind, group by selector, resolve, revert, export as Markdown or JSON.",
    keywords: [
      "Design Mode Changes tab",
      "design change history",
      "structured design diff",
      "design export",
    ],
    intro:
      "The Changes tab is where every edit you make in the side panel lands. It's the foundation of the handoff — to a teammate, to a tracker, to an AI agent.",
    sections: [
      {
        heading: "What lands in the Changes tab",
        body: "Style changes (typography, colour, spacing, layout, motion, effects), text changes, DOM mutations (duplicate, delete, reorder, restructure), and comment pins. Each row records the selector, property, old value, and new value.",
      },
      {
        heading: "Search, filter, group",
        body: "Sticky header with search and filter chips at the top. Search by selector, property name, or value. Filter by kind (style / text / DOM / comment). Group by selector to see every change to a single element.",
      },
      {
        heading: "Resolve, reopen, edit, delete",
        body: "Each row has per-item actions. Resolved items collapse but remain in history.",
      },
      {
        heading: "Export & import",
        body: "Export the change set as JSON (machine-readable) or Markdown (selector → property → value, perfect for Linear / Jira / GitHub). Import JSON to restore a session on another machine.",
      },
    ],
    related: ["mcp-setup", "install", "troubleshooting"],
  },
  {
    slug: "troubleshooting",
    title: "Troubleshooting",
    metaTitle:
      "Troubleshooting Design Mode — side panel won't open, MCP not connecting",
    metaDescription:
      "Fix common Design Mode issues: side panel won't open, MCP not connecting, edits not persisting, the Send-to-Agent button greyed out.",
    keywords: [
      "Design Mode troubleshooting",
      "Design Mode not working",
      "MCP not connecting",
      "Chrome extension fix",
      "side panel won't open",
    ],
    intro:
      "Most issues fall into a handful of patterns. Here's the short list.",
    sections: [
      {
        heading: "The side panel doesn't open",
        body: "Update to a current Chrome, Edge, Brave or Arc release that supports Manifest V3 side panels. The extension manifest does not declare an exact Chrome minimum. In Chrome, check Settings → Launch: Floating and Pin on top open a separate window rather than the docked panel. Some enterprise policies block the side panel API; try a clean Chrome profile to rule out a conflicting extension.",
      },
      {
        heading: "MCP status chip stays offline",
        body: "Cloud mode: confirm your bearer token is pasted on the extension's dedicated MCP page (opened from the header MCP chip) and the same token is in your agent's config. Local mode: confirm the companion server is running (clone the repo, npm install, npm start) and your config's cwd points at the repo root. Multiple Design Mode clients can share port 9960; never add a kill -9 startup command. If another application owns 9960, choose a different DM_PORT such as 9961 and set the extension's Local port to match. Self-hosted: confirm the relay URL is correct and Redis is healthy.",
      },
      {
        heading: "Send to Agent button is greyed out",
        body: "The button only enables when an agent is actually attached (the MCP status chip will be the connected colour). Restart your agent after pasting the config snippet — most clients only re-read MCP servers at startup.",
      },
      {
        heading: "Edits aren't persisting",
        body: "Chromium stores each per-URL change session in storage.session, so it survives reloads but not a full browser restart. Firefox falls back to storage.local. Incognito windows and separate browser profiles have separate extension storage. If the Changes tab still lists an edit after reload, the site may simply have re-rendered over the browser preview.",
      },
      {
        heading: "Still stuck?",
        body: "Open the Help panel inside the extension (? icon) → Copy diagnostics → file an issue on GitHub. The diagnostics block has the environment metadata maintainers need.",
      },
    ],
    related: ["install", "mcp-setup", "changes-tab"],
  },
];

export function getDoc(slug: string): DocPage | undefined {
  return docs.find((d) => d.slug === slug);
}
