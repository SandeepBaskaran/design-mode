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
    metaTitle:
      "Install Design Mode — Chrome, Edge, Brave, Arc, Firefox installation guide",
    metaDescription:
      "How to install the Design Mode browser extension in Chrome, Edge, Brave, Arc, or Firefox. Pin the side panel (sidebar on Firefox), open any page, start designing. No account required.",
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
      "Design Mode is a free browser extension for Chrome and Firefox. Install once, open the side panel (sidebar on Firefox), open any page and start designing. No account, no setup wizard.",
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
        heading: "3. Open any page and click the icon",
        body: "Navigate to any URL — your dev server, a staging deploy, a production site — and click the Design Mode toolbar icon. The side panel opens with the design surface (on Firefox this is the native sidebar; Alt+D toggles it on any browser).",
      },
      {
        heading: "4. (Optional) Set up MCP for AI agents",
        body: "If you want to ship edits to Claude Code, Cursor, Claude Desktop, Windsurf, or Cline, follow the MCP setup guide. The default Cloud mode requires no local install.",
      },
    ],
    related: ["browser-support", "mcp-setup", "keyboard-shortcuts", "troubleshooting"],
  },
  {
    slug: "browser-support",
    title: "Browser support & parity",
    metaTitle:
      "Browser support — Chrome, Firefox, and feature parity",
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
        body: "The whole editing surface is the same: inspect any element; edit Position, Layout, Typography, Fill, Stroke, Effects, Motion, and Layout Guides; the Layers tree; the Changes tab with export/import; comments; element and viewport screenshots; DOM edits (duplicate, delete, reorder); the design-token engine; and the full MCP / send-to-agent handoff. Alt+D toggles the panel (sidebar on Firefox) everywhere.",
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
      "Every keyboard shortcut in Design Mode — inspector, comments, tabs, undo/redo, screenshot, export CSS — plus the one browser-level shortcut you can rebind. Designed for fast iteration without leaving the keyboard.",
    keywords: [
      "Design Mode keyboard shortcuts",
      "design tool shortcuts",
      "Chrome extension shortcuts",
      "keyboard reference",
    ],
    intro:
      "Design Mode has 13 shortcuts that work directly on the page while the side panel is open, plus one browser-level shortcut that opens the panel itself — 14 in total.",
    sections: [
      {
        heading: "In-page shortcuts",
        body: "These fire on the page itself while the side panel is open: Alt+I toggles Inspect, Alt+C drops a comment pin, Alt+R starts a region comment (drag a rectangle), Alt+P pauses/resumes all motion on the page, Alt+S screenshots the selected element, and Alt+X copies the exported CSS to your clipboard.",
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
        heading: "Opening the side panel",
        body: "Alt+D is a separate, browser-level shortcut — it opens the panel on both Chrome and Firefox (the side panel on Chrome, the sidebar on Firefox), it's not handled by the page, and it's the only one of the 14 you can rebind. Change it at chrome://extensions/shortcuts on Chrome, or about:addons › Manage Extension Shortcuts on Firefox. None of the 13 in-page shortcuts above can be remapped from Settings — that list is read-only.",
      },
    ],
    related: ["install", "changes-tab", "mcp-setup"],
  },
  {
    slug: "mcp-setup",
    title: "MCP setup",
    metaTitle:
      "MCP setup docs — Configure Claude Code, Cursor, Claude Desktop, Windsurf, Cline",
    metaDescription:
      "Step-by-step MCP setup for every supported AI coding agent — Claude Desktop, Claude Code, Cursor, Windsurf, Cline. Cloud, Local, and Self-hosted connection modes.",
    keywords: [
      "MCP setup",
      "Claude Code MCP setup",
      "Cursor MCP setup",
      "Claude Desktop MCP",
      "Windsurf MCP setup",
      "Cline MCP setup",
    ],
    intro:
      "Design Mode talks to AI coding agents over Model Context Protocol. You pick one of three connection modes (Cloud, Local, Self-hosted), paste the snippet, and restart your agent. Full snippets and the live mode comparison live on the /mcp page; this page links into it.",
    sections: [
      {
        heading: "Pick a mode",
        body: "Cloud is the default (no install). Local is offline + lowest latency. Self-hosted is for teams who want Cloud ergonomics on their own infrastructure. See the live comparison on /mcp.",
      },
      {
        heading: "Paste the snippet for your agent",
        body: "The /mcp page has the exact JSON for Claude Desktop (claude_desktop_config.json), Cursor (~/.cursor/mcp.json), Claude Code (.claude/settings.json), and any other MCP-aware client.",
      },
      {
        heading: "Restart and verify",
        body: "Restart your agent. The eight Design Mode MCP tools (get_changes, apply_changes, set_change_status, clear_changes, get_session_summary, export_changes, get_screenshot, mark_comment_resolved) will appear. The side panel's MCP status chip will turn green once an agent attaches.",
      },
    ],
    related: ["install", "troubleshooting", "changes-tab"],
  },
  {
    slug: "changes-tab",
    title: "The Changes tab",
    metaTitle:
      "Changes tab — Searchable, exportable design change history",
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
        body: "Make sure your browser supports MV3 side panels (Chrome 114+, Edge 114+, Arc, Brave). Some enterprise policies block the side panel API. Try a clean Chrome profile to rule out a conflicting extension.",
      },
      {
        heading: "MCP status chip stays offline",
        body: "Cloud mode: confirm your bearer token is pasted on the extension's dedicated MCP page (opened from the header MCP chip) and the same token is in your agent's config. Local mode: confirm the companion server is running (clone the repo, npm install, npm start) and your config's cwd points at the repo root. Self-hosted: confirm the relay URL is correct and Redis is healthy.",
      },
      {
        heading: "Send to Agent button is greyed out",
        body: "The button only enables when an agent is actually attached (the MCP status chip will be the connected colour). Restart your agent after pasting the config snippet — most clients only re-read MCP servers at startup.",
      },
      {
        heading: "Edits aren't persisting",
        body: "Design Mode stores edits in chrome.storage per origin. If you reload after switching to Incognito or a different Chrome profile, the storage is separate. Check the Changes tab is showing your edits — if it is, the storage is fine, just the page may have re-rendered.",
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
