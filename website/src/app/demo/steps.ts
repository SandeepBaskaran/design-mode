// Step data for the /demo page. Each entry produces one section card in the
// main content + one entry in the left navbar. `parentId` lets a step nest
// under another in the nav (used for the Design panel sub-anchors).

export type Step = {
  id: string;
  title: string;
  body: string[]; // paragraphs
  tryIt?: string; // copy for the "Try it" callout
  targetId?: string; // matches a key in DemoTargets if this step has an interactive demo block
  parentId?: string; // for nested nav (Design sub-sections)
  // Optional follow-on link rendered at the bottom of the step card —
  // used to bridge the demo into the /mcp setup tour.
  nextLink?: { label: string; href: string };
};

export const STEPS: Step[] = [
  {
    id: "get-started",
    title: "Get started",
    body: [
      "Design Mode is a Chrome, Firefox, and Safari extension for previewing visual changes on scriptable pages. This practice canvas requires the extension: inspect a card, tweak its padding, review Changes, and use Copy as prompt to hand the spec to a developer or agent.",
      "Pin the extension and click its icon to open. Chrome opens your chosen launch surface, Firefox 140+ opens its sidebar, and Safari uses Web Inspector (Option–Command–I). Alt+D toggles the panel on Chrome and Firefox; Alt+Shift+S takes a screenshot.",
    ],
    tryIt:
      "Pin Design Mode in your browser toolbar, then click its icon to open the side panel (the sidebar on Firefox).",
  },
  {
    id: "panel-modes",
    title: "Three panel modes",
    body: [
      "Chromium supports three one-click panel states (Firefox uses its docked sidebar): Docked in the side panel, Floating in a pop-out window, or Pinned on top via Picture-in-Picture.",
    ],
    tryIt:
      "On Chromium, click the pop-out icon in the header, then click the PiP icon to pin it on top. Click the PiP icon to unpin, or the side-panel icon to dock back.",
  },
  {
    id: "local-files",
    title: "Local HTML files",
    body: [
      "Chrome blocks extensions on file:// pages by default. Enable 'Allow access to file URLs' for Design Mode in chrome://extensions before inspecting local HTML files—the panel walks you through it if off.",
    ],
    tryIt:
      "Save any page as .html, open it via file:// in Chrome, and open the side panel. Flip the file-access toggle if prompted.",
  },
  {
    id: "inspector",
    title: "Inspector mode",
    body: [
      "Toggle Inspect with the crosshair icon (or Alt+I). Hovering outlines elements and updates the indicator chip to 'Hovering'; clicking locks the layer as 'Selected' in the Design tab.",
      "If Chrome's device toolbar uses touch emulation and blocks hover events, the panel shows a quick prompt to switch it off or continue with tap-to-select.",
    ],
    tryIt:
      "Click the crosshair in the header, hover over the card below, then click to select it.",
    targetId: "inspector",
    nextLink: {
      label: "Check supported browsers and page limits →",
      href: "/blog/browser-support",
    },
  },
  {
    id: "multi-select",
    title: "Multi-select & distribute",
    body: [
      "Hold Shift (or Cmd/Ctrl) and click to select multiple elements at once—Design-tab edits apply to the whole selection, and Position unlocks Figma-style horizontal/vertical Distribute buttons.",
      "You can also toggle multi-select in Layers or tick 'Select matching layers' in the indicator chip to grab every element with the same tag and class.",
    ],
    tryIt:
      "Select the first card below, Shift-click the other two, and change their fill colour together. Try Distribute in Position, then test 'Select matching layers'.",
    targetId: "multi-select",
  },
  {
    id: "measure-resize",
    title: "Measure & resize",
    body: [
      "Hovering draws full-page alignment guides. With an element selected, hover another to read edge-to-edge pixel distances and side offsets.",
      "Drag any of the 8 selection handles (4 corners, 4 edges) to resize live—width and height flow straight into Changes and CSS export.",
    ],
    tryIt:
      "Select the card below, hover surrounding elements to read spacing, then drag a corner handle to resize.",
    targetId: "measure-resize",
  },
  {
    id: "annotate-draw",
    title: "Comments & regions",
    body: [
      "Drop numbered comment pins on any element (Alt+C) or drag a region box (Alt+R). Both track in the Changes tab under the Comments filter without altering page styles.",
      "Copy as Prompt includes region coordinates; JSON export bundles a zip with one PNG per region when region notes exist.",
    ],
    tryIt:
      "Press Alt+C to drop a pin on the note below, then Alt+R to drag a region box around it. Check Changes → Comments.",
    targetId: "annotate-draw",
  },
  {
    id: "layers",
    title: "Layers panel",
    body: [
      "Browse and search the page's DOM tree by tag, class, id, or smart name. Drag rows to reorder elements, toggle visibility with the eye icon, or enable multi-select.",
    ],
    tryIt:
      "Open the Layers tab, search for 'card' or 'demo', and drag-reorder one of the list items below.",
    targetId: "layers",
  },
  {
    id: "design",
    title: "Design panel",
    body: [
      "Edit the selected layer using Figma's section order: Position → Layout → Appearance → Typography → Fill → Stroke → Effects → Motion → Layout guide. Only relevant sections appear; empty ones start collapsed.",
    ],
  },
  {
    id: "design-indicator",
    title: "Indicator + Icon + Media",
    body: [
      "The top indicator chip shows 'Selected', 'Hovering', or 'Page', with a CSS button for computed styles. Selecting a known SVG icon (Lucide, FontAwesome) surfaces an Icon section; images, video, and SVGs surface a Media preview with a Download button.",
    ],
    tryIt:
      "Select the heart icon and photo below to see the Icon and Media sections above Position. Click Download on the photo.",
    targetId: "design-indicator",
    parentId: "design",
  },
  {
    id: "design-position",
    title: "Position",
    body: [
      "Control position type (static, relative, absolute, fixed, sticky), object alignment, X/Y/Z offsets, rotation, and flip. Advanced adds anchor positioning, 3D perspective, skew, transform-origin, and logical insets.",
    ],
    tryIt:
      "Select the card below and click 'Align right', 'Rotate 90° clockwise', and 'Flip horizontally'.",
    targetId: "design-position",
    parentId: "design",
  },
  {
    id: "design-layout",
    title: "Layout",
    body: [
      "Switch between block, horizontal stack, vertical stack, and grid (Grid prefills 1fr 1fr), then adjust W/H, aspect lock, padding/margin, gap, and the 9-cell alignment pad. Advanced adds full grid templates, item placement, overflow, and box-sizing.",
    ],
    tryIt:
      "Select the container below, switch Layout to Horizontal stack and Grid, and test the children-align pad.",
    targetId: "design-layout",
    parentId: "design",
  },
  {
    id: "design-appearance",
    title: "Appearance",
    body: [
      "Adjust opacity, corner radius (with per-corner toggle), CSS corner-shape (squircle, scoop, bevel, notch), and color-adjust filters. Advanced adds blend mode, clip-path editor, backdrop blur, scrollbars, and pointer controls.",
    ],
    tryIt:
      "Select the card below, expand individual corners, set top-left to 24px and bottom-right to 0, then pick squircle or scoop in Corner shape.",
    targetId: "design-appearance",
    parentId: "design",
  },
  {
    id: "design-typography",
    title: "Typography",
    body: [
      "Shown for text layers: pick page-discovered fonts, weight, size, line-height, letter-spacing, and color (with live WCAG contrast). Toggle decoration, case, alignment, and list style; Advanced adds line-clamp, OpenType features, and writing-mode.",
    ],
    tryIt:
      "Select the heading below, set size to 32px, toggle UPPERCASE, and set letter-spacing to 0.04em.",
    targetId: "design-typography",
    parentId: "design",
  },
  {
    id: "design-fill",
    title: "Fill",
    body: [
      "Stack multiple solid, gradient (linear, radial, conic), and image fill layers, each with its own size, repeat, position, and blend mode. Advanced covers background clip/origin, masks, and SVG fill-rule/stroke caps.",
    ],
    tryIt:
      "Select the hero block below and click '+ Add fill' → Linear gradient to stack it over the solid fill.",
    targetId: "design-fill",
    parentId: "design",
  },
  {
    id: "design-stroke",
    title: "Stroke",
    body: [
      "Set Inside, Outside, or Center stroke positioning, color, weight, border-style, and per-side widths. Choosing 'dashed' reveals dash, gap, and cap controls.",
    ],
    tryIt:
      "Select the square below, set Stroke color to red, weight 2, position Outside, then switch to Inside.",
    targetId: "design-stroke",
    parentId: "design",
  },
  {
    id: "design-effects",
    title: "Effects",
    body: [
      "Stack six Figma-aligned effects: Inner shadow, Drop shadow (switches between box-shadow, text-shadow, and alpha-bound filter:drop-shadow), Layer blur, Background blur, Noise (Mono/Duo/Multi), and Texture (with optional Clip to shape).",
    ],
    tryIt:
      "Select the floating card, add a Drop shadow, toggle 'Show behind transparent areas', then add Noise → Mono.",
    targetId: "design-effects",
    parentId: "design",
  },
  {
    id: "design-motion",
    title: "Motion",
    body: [
      "Build trigger-based interaction cards for Hover, Press, Focus, Appear (@starting-style), Loop, and Scroll (view() timeline) with presets, shared easing curves, and a live Preview button. Raw CSS transition and animation editors live in Advanced.",
    ],
    tryIt:
      "Select the floating card, add a Hover interaction with the Background preset in Motion, and click Preview.",
    targetId: "design-motion",
    parentId: "design",
  },
  {
    id: "design-layout-guide",
    title: "Layout guide",
    body: [
      "Overlay non-destructive Columns, Rows, or Grid guides on the selected element via ::before. Configure count, color, opacity, alignment, margin, and gutter per row, or toggle all guides from the section header.",
    ],
    tryIt:
      "Select the full-width container below, add a 12-column Layout guide, and toggle its visibility from the header eye.",
    targetId: "design-layout-guide",
    parentId: "design",
  },
  {
    id: "design-tokens",
    title: "Design tokens",
    body: [
      "Discovers CSS custom properties across themes (.dark, [data-theme]), media queries, and cascade layers, auto-labelling systems like Tailwind v4, shadcn/ui, Radix, MUI, and Carbon.",
      "Token-backed fields show a ◆ badge to swap tokens, edit them globally in their resolved scope, or detach to a literal value.",
    ],
    tryIt:
      "Select the swatch below and open its Fill colour picker to see Tokens, or click a ◆ badge to swap or edit a token.",
    targetId: "design-tokens",
    parentId: "design",
  },
  {
    id: "presets",
    title: "Presets",
    body: [
      "Open the Design system panel (swatch-book icon) to save, apply, edit, delete, or import/export reusable style presets across all eight Design-tab sections.",
    ],
    tryIt:
      "Open the swatch-book icon, apply a seeded preset to the block below, then save the block's styles as a new preset.",
    targetId: "presets",
  },
  {
    id: "changes",
    title: "Changes panel",
    body: [
      "Tracks every style, text, DOM, and breakpoint-tagged edit with 'View Original' / 'View Changes' toggling. Revert individual edits, batch-apply a change to matching elements, or export JSON and CSS (Alt+X).",
    ],
    tryIt:
      "Open the Changes tab, toggle 'View Original', test Batch apply (zap icon) on a style change, and export JSON.",
    nextLink: {
      label: "Review Changes and handoff formats →",
      href: "/blog/changes-tab",
    },
  },
  {
    id: "action-row",
    title: "Action row",
    body: [
      "The toolbar above the tabs gives quick access to Parent/Child navigation, Duplicate/Remove, Comment, Pause animations, Screenshot, Design system (swatch-book), and Undo/Redo.",
    ],
    tryIt:
      "Select the badge below, walk Parent/Child, duplicate and remove it, then click Pause animations to freeze the pulse.",
    targetId: "action-row",
  },
  {
    id: "settings",
    title: "Settings",
    body: [
      "Click the gear icon to configure Color format (HEX/RGB), Input unit (PX/REM), Nudge amount (Shift+Arrow step), Screenshot capture mode, Page cursor, Chrome launch surface (Side panel/Floating/Pin on top), or Reset settings.",
    ],
    tryIt:
      "Open Settings and switch Color format from HEX to RGBA to see Design-tab values update live.",
  },
  {
    id: "theme",
    title: "Theme",
    body: [
      "Cycle the panel's own theme between Light, Dark, and System from the header switcher—independent of the page you are editing.",
    ],
    tryIt:
      "Click the moon/sun icon in the panel header to switch between light and dark themes.",
  },
  {
    id: "mcp",
    title: "MCP server",
    body: [
      "Click the MCP chip in the header to connect your coding agent via Cloud (anonymous credential), Local (stdio companion), or Self-hosted (your own relay) and send changes live.",
    ],
    tryIt:
      "Click the MCP chip to open connection settings and pick Cloud, Local, or Self-hosted.",
    nextLink: { label: "Read the full MCP setup guide →", href: "/mcp" },
  },
  {
    id: "copy-prompt",
    title: "Copy as Prompt",
    body: [
      "Generates a Markdown summary of all recorded edits—selectors, CSS diffs, word-level text diffs, DOM ops, comments, breakpoint tags, and optional source hints—and copies it to your clipboard.",
    ],
    tryIt:
      "Click Copy as prompt at the bottom of the panel and paste into a text editor or AI chat.",
    nextLink: {
      label: "Add intent, scope and acceptance checks →",
      href: "/blog/turn-visual-edits-into-precise-ai-prompts",
    },
  },
  {
    id: "send-to-agent",
    title: "Send to Agent",
    body: [
      "Marks the current batch of edits ready over MCP so your connected agent sees an explicit handoff signal in get_changes and get_session_summary. Your agent still uses its own repo access to apply the source diff for your review.",
    ],
    tryIt:
      "With an MCP client attached, click Send to Agent and ask your agent to read the current session.",
    nextLink: { label: "Set up your agent →", href: "/mcp" },
  },
];
