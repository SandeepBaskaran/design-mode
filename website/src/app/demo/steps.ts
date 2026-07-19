// Step data for the /demo page. Each entry produces one section card in the
// main content + one entry in the left navbar. `parentId` lets a step nest
// under another in the nav (used for the Design panel sub-anchors).

export type Step = {
  id: string;
  title: string;
  body: string[];        // paragraphs
  tryIt?: string;        // copy for the "Try it" callout
  targetId?: string;     // matches a key in DemoTargets if this step has an interactive demo block
  parentId?: string;     // for nested nav (Design sub-sections)
  // Optional follow-on link rendered at the bottom of the step card —
  // used to bridge the demo into the /mcp setup tour.
  nextLink?: { label: string; href: string };
};

export const STEPS: Step[] = [
  {
    id: "get-started",
    title: "Get started",
    body: [
      "Design Mode is a Chromium extension that turns any website into a live design surface. Edit layout, type, colour, and structure with visual controls — then ship the result to your AI coding agent.",
      "First time? Pin the extension to your toolbar so it's always one click away, then click the Design Mode icon to open the side panel on this page. Once it's open, every in-page shortcut (Alt+I to inspect, Alt+A to comment, Alt+D to draw, …) is listed and remappable in Settings.",
    ],
    tryIt:
      "Pin Design Mode in your Chrome toolbar, then click its icon to open the side panel on the right.",
  },
  {
    id: "panel-modes",
    title: "Three panel modes",
    body: [
      "The panel runs wherever you want it. Docked (the default) lives in Chrome's native side panel. Pop out (the external-link icon in the header) detaches it into a free-floating window you can move anywhere — it stays bound to the tab it came from, even while you browse other tabs.",
      "From the floating window, the picture-in-picture icon pins the panel on top of everything — a true always-on-top window (Chrome 116+), floating above the page and every other app, so you never Cmd-` between windows while editing. While pinned, the same icon renders in the accent style: click it to drop back to the floating window, or hit the side-panel icon to dock straight home. All three states are one click apart.",
    ],
    tryIt:
      "Open the side panel, click the pop-out icon in its header, then click the picture-in-picture icon in the floating window. Drag the pinned panel over this page — it stays on top. Click the accent picture-in-picture icon to unpin, then the side-panel icon to dock back.",
  },
  {
    id: "local-files",
    title: "Local HTML files",
    body: [
      "Design Mode also edits pages served from your disk — open any local HTML file via file:// and the whole toolkit works: inspect, restyle, comment, export the diff.",
      "Chrome blocks extensions from file:// pages by default, so there's a one-time switch: enable 'Allow access to file URLs' for Design Mode in chrome://extensions. If it's off, the side panel detects it and walks you through exactly that step.",
    ],
    tryIt:
      "Save any web page (or a scrappy prototype) as an .html file, open it in Chrome via file://, and pop the side panel open. If Chrome blocks it, follow the panel's built-in instructions to flip the file-access toggle.",
  },
  {
    id: "inspector",
    title: "Inspector mode",
    body: [
      "The crosshair icon at the top of the side panel toggles inspector mode. Hover any element on the page and you'll see a blue outline; click to select it and the Design tab fills with that element's properties.",
      "Hovering shows the layer in the panel's indicator chip as 'Hovering'. Clicking flips it to 'Selected' and locks the focus on that layer.",
    ],
    tryIt:
      "Click the crosshair in the side panel header, then hover over the card below. Click the card to select it.",
    targetId: "inspector",
  },
  {
    id: "multi-select",
    title: "Multi-select & distribute",
    body: [
      "Hold Shift (or Cmd / Ctrl) and click to select several elements at once — the indicator chip shows a count badge. Every edit in the Design tab now applies to the whole selection, so you can change padding, colour, or type on all of them in one move.",
      "With multiple layers selected, the Position section gains Distribute buttons that space them evenly across the horizontal or vertical axis, exactly like Figma. The Layers tab also has a multi-select toggle for picking elements from the tree.",
      "The indicator chip's Selected row also has a Select matching layers checkbox — tick it and every layer matching the same tag/class as your selection joins it, in place of the old similarity wand and threshold slider.",
    ],
    tryIt:
      "Turn on inspect, click the first card below, then Shift-click the other two. Change their fill colour once — all three update together. Open Position and try the Distribute buttons. Then select one card alone and tick Select matching layers to pull the others back in.",
    targetId: "multi-select",
  },
  {
    id: "measure-resize",
    title: "Measure & resize",
    body: [
      "Inspect mode doubles as a measuring tool. Hovering an element draws dashed guide lines through its edges, spanning the page, so you can read alignment at a glance.",
      "With one element selected, hover another and edge-to-edge distance pills appear — the gap between them plus the side offsets, exactly like VisBug or Figma's measure tool. Shift-click extra elements to see the pixel spacing between them.",
      "The selected element also gets 8 drag handles (four corners + four edge midpoints). Drag any of them to resize live; the new width and height ship straight into the Changes tab and the CSS export, so your agent gets the exact dimensions.",
    ],
    tryIt:
      "Select the card below, then hover the elements around it to read the spacing. Grab a corner handle and drag to resize.",
    targetId: "measure-resize",
  },
  {
    id: "annotate-draw",
    title: "Annotate & draw",
    body: [
      "Design Mode overlays two annotation tools on the live page. Comment pins (the comment icon in the action row, or Alt+A) drop a numbered marker on any element — resolve, reopen, or edit them, and they collect in the Changes tab under the Comments filter so they ship alongside your edits.",
      "Freehand Drawing mode (Alt+D) lets you sketch straight over the page to point things out. Both are overlay-only — they annotate without ever touching the page's own styles.",
    ],
    tryIt:
      "Press Alt+A (or click the comment icon) and drop a pin on the note below. Then press Alt+D and sketch over it. Open the Changes tab → Comments filter to see the pin tracked.",
    targetId: "annotate-draw",
  },
  {
    id: "layers",
    title: "Layers panel",
    body: [
      "The Layers tab shows the page's DOM as a tree. Search by tag, class, id, or smart name. Drag layers to reorder them. Toggle visibility with the eye icon. Multi-select to apply edits to several layers at once.",
      "Each row shows: indentation guide, drag handle, expand/collapse chevron, tag icon, smart name, and a hover-revealed eye toggle. Long layer names wrap instead of forcing the row to scroll sideways.",
    ],
    tryIt:
      "Switch to the Layers tab. Try the search input — type 'card' or 'demo'. Drag-reorder one of the list items below.",
    targetId: "layers",
  },
  {
    id: "design",
    title: "Design panel",
    body: [
      "The Design tab is where you edit a selected layer's properties. It mirrors Figma's section order — Position → Layout → Appearance → Typography → Fill → Stroke → Effects → Motion → Layout guide — so the mental model carries over.",
      "Sections only render for relevant layer kinds: Typography appears on text layers, Layout hides for media, etc. The sub-sections below walk through each, starting with the indicator chip and the Icon / Media sections that surface above Position.",
    ],
  },
  {
    id: "design-indicator",
    title: "Indicator + Icon + Media",
    body: [
      "At the top of the Design tab, the indicator chip shows what's currently focused: 'Selected' (blue), 'Hovering' (yellow), or 'Page' (when no specific layer is picked). The CSS button next to it opens a computed-CSS overlay for the selection.",
      "When you select an SVG icon from a known library (Lucide, FontAwesome), an Icon section appears so you can swap to a different icon in the same library. When you select an image / video / SVG element, a Media section appears with a preview, src, fit, alt, and a one-click Download button.",
    ],
    tryIt:
      "Pick the heart icon and the photo below. Notice the Icon and Media sections appear above Position. Click the Download button on the photo.",
    targetId: "design-indicator",
    parentId: "design",
  },
  {
    id: "design-position",
    title: "Position",
    body: [
      "Position handles where a layer sits inside its parent: position type (static / relative / absolute / fixed / sticky), object alignment, X/Y/Z, rotation, and flip.",
      "Try aligning the card to the right edge using the alignment buttons. Try rotating it 90° with the quick-rotate icon. Try flipping it horizontally.",
      "Advanced unfolds the deep stuff: anchor positioning, 3D perspective and transform-style, skew, transform-origin, view-transition-name, and logical (writing-mode-aware) inset anchors.",
    ],
    tryIt:
      "Select the card below. In Position, click 'Align right', then 'Rotate 90° clockwise', then 'Flip horizontally'.",
    targetId: "design-position",
    parentId: "design",
  },
  {
    id: "design-layout",
    title: "Layout",
    body: [
      "Layout is for sizing and child arrangement. The 4-mode segmented switches between block, horizontal stack (flex row), vertical stack (flex column), and grid. Below it: W/H, aspect ratio lock, padding/margin nested box, gap, and the 9-cell children-align pad.",
      "Switching to Grid auto-prefills a 1fr 1fr template so you see the change immediately.",
      "Advanced opens the full grid template editor (columns / rows / areas), per-item flex and grid placement, clip & overflow, box-sizing, and logical margins for i18n layouts.",
    ],
    tryIt:
      "Select the container below. Switch its Layout mode from Free to Horizontal stack, then to Grid. Try the children-align pad to push items around.",
    targetId: "design-layout",
    parentId: "design",
  },
  {
    id: "design-appearance",
    title: "Appearance",
    body: [
      "Appearance covers opacity and corner radius as compact, icon-led fields (the label lives in the tooltip), plus the color-adjust filters (brightness, contrast, saturate, hue-rotate, grayscale, invert, sepia). Blend mode and isolation moved into Advanced.",
      "The corner radius has a primary input + a scan toggle that expands a 2×2 grid for individual corners. Click the scan icon and try unequal corners.",
      "Advanced goes further: blend mode, isolation, a structured clip-path editor with live preview, backdrop blur, scrollbar styling, containment / content-visibility, color-scheme, and pointer / selection interaction controls.",
    ],
    tryIt:
      "Select the card below. In Appearance, click the scan icon next to Corner radius, set the top-left corner to 24px and the bottom-right to 0.",
    targetId: "design-appearance",
    parentId: "design",
  },
  {
    id: "design-typography",
    title: "Typography",
    body: [
      "Typography is shown for text-bearing layers (h1-h6, p, span, a, button, label, …). Pick from page-discovered fonts, set weight, size, line-height, letter-spacing, color (with an inline WCAG contrast read-out). Toggle bold / italic / underline / strikethrough. Choose case, alignment, and list style.",
      "Advanced exposes text decoration, wrapping and line-clamp, OpenType font-features, and direction / writing-mode for right-to-left and vertical scripts.",
    ],
    tryIt:
      "Select the heading below. Bump the size to 32px, try changing case to UPPERCASE, then back to none. Set letter-spacing to 0.04em.",
    targetId: "design-typography",
    parentId: "design",
  },
  {
    id: "design-fill",
    title: "Fill",
    body: [
      "Fill is multi-layered. Add a solid color, a gradient (linear / radial / conic), or an image as separate stacked layers. Each layer has its own size / repeat / position / blend mode in the per-layer settings.",
      "Advanced covers background painting (clip / origin / attachment), masks, and — on SVG layers — a dedicated SVG paint sub-section with fill-rule and stroke linecap / linejoin.",
    ],
    tryIt:
      "Select the hero block below. Click '+ Add fill' → Linear gradient. The gradient stacks on top of the existing solid.",
    targetId: "design-fill",
    parentId: "design",
  },
  {
    id: "design-stroke",
    title: "Stroke",
    body: [
      "Stroke supports Inside / Outside / Center positioning. Color, weight, full CSS border-style dropdown (solid, dashed, dotted, double, groove, ridge, inset, outset, hidden, none, plus auto for browser focus rings), and per-side widths via the settings-2 icon.",
      "Picking 'dashed' opens a dashed config panel: dash, gap, and cap (square / round) — stored as design tokens for code generation.",
    ],
    tryIt:
      "Select the square below. In Stroke, set color to red, weight 2, position Outside. Then switch to Inside to see how the stroke moves.",
    targetId: "design-stroke",
    parentId: "design",
  },
  {
    id: "design-effects",
    title: "Effects",
    body: [
      "Effects is a Figma-aligned six-kind layered list: Inner shadow, Drop shadow, Layer blur, Background blur, Noise (Mono / Duo / Multi), and Texture. Each row drags to reorder, hides via the eye, and removes via the trash.",
      "Drop shadow is one row spanning three CSS chains — the 'Show behind transparent areas' checkbox swaps between box-shadow (rectangle), text-shadow (alpha-bound to glyphs on text elements), and filter:drop-shadow (alpha-bound to the whole element shape). Spread is preserved when toggled off and re-emitted when toggled back on.",
      "Noise renders via SVG-data-URI background overlays on a ::after pseudo-element so it doesn't disturb layout; Texture works the same with an optional 'Clip to shape' that inherits the element's border-radius and clip-path.",
    ],
    tryIt:
      "Select the floating card below. Click the + in the Effects header, then 'Drop shadow'. Toggle the 'Show behind transparent areas' checkbox to see how the shadow swaps between rectangle and alpha-bound rendering. Then add Noise → Mono and watch the grain land.",
    targetId: "design-effects",
    parentId: "design",
  },
  {
    id: "design-motion",
    title: "Motion",
    body: [
      "Motion leads with interaction cards organised by trigger — the thing raw CSS transitions leave implicit. Hover / Press / Focus animate to a target state while that state is active; Appear animates from a start state when the element mounts (@starting-style); Loop plays an infinite keyframe; Scroll drives an animation-timeline: view() as the element crosses the viewport.",
      "Each card has change-row presets (Fade / Lift / Scale / Background), a shared easing Curve, a plain-English summary of what it does, and a real Preview button that plays the interaction on the page — not just a static readout.",
      "The raw per-property editors (Transition, Animation, Transform, Motion path, View transition, Scroll-driven animation) still exist for power users — they've moved under Motion → Advanced. The custom-curve (cubic-bézier) picker lives in both places.",
    ],
    tryIt:
      "Select the floating card. Expand Motion, add a Hover interaction from the When: row, pick the Background preset, then click Preview to watch it play. Open Advanced underneath to see the raw transition/animation editors, or pick 'Custom' in a timing dropdown to drag a bézier curve.",
    targetId: "design-motion",
    parentId: "design",
  },
  {
    id: "design-layout-guide",
    title: "Layout guide",
    body: [
      "Figma-style overlay of Columns / Rows / Grid bars on the selected element. Renders as a ::before pseudo-element so it doesn't touch layout; per-element session memory means the bars stay configured when you reselect the element.",
      "Each row carries a kind dropdown, count (or cell size for Grid), settings expand, eye, and trash. Settings opens a 3×2 grid for Columns/Rows (Colour + Opacity / Align + Size / Margin + Gutter) or 1×2 for Grid (Colour + Opacity). The section header's eye toggles every guide on the element without losing the row config — it only appears once you've added a second guide row, and per-row eyes dim while the section-level toggle is hiding everything.",
    ],
    tryIt:
      "Select the full-width container below. Open Layout guide → click Add → keep Columns kind, count 12, default 10% red. Toggle the section eye to hide and re-show the overlay. Drag to add a second guide row for Rows.",
    targetId: "design-layout-guide",
    parentId: "design",
  },
  {
    id: "design-tokens",
    title: "Design tokens",
    body: [
      "The token-discovery engine finds every CSS custom property a page declares — not just :root. Theme scopes (`.dark`, `[data-theme]`), component scopes, matching @media / @supports blocks, and cascade layers are all picked up, so a design-heavy site can surface hundreds of tokens instead of the handful declared globally.",
      "Known systems — IBM Carbon, Material, MUI, Bootstrap, Polaris, Radix, shadcn/ui, Tailwind v4 — are recognised and labelled by name, with each system's own taxonomy driving how tokens group in the panel.",
      "Any Design-tab field whose value resolves from a variable shows a ◆ token badge naming it. Click the badge for Swap token… (a matched picker for colour, spacing, radius, typography, or shadow — not just colour), Edit token globally (jumps to the Tokens panel with that token's scope pre-selected), or Detach from token (writes the resolved literal instead).",
      "Editing stays scope-aware — a token is one value per theme, so a change writes into a managed override stylesheet scoped to where the element actually resolves it, rather than clobbering every theme at once. The exported diff and Copy as Prompt carry the token name and scope, not a frozen value — your agent edits the token's definition, not the component.",
    ],
    tryIt:
      "Select the swatch below and open its Fill colour picker to see the Tokens row, or look for a ◆ badge on an already token-backed field. Click the badge and try Swap token… or Edit token globally.",
    targetId: "design-tokens",
    parentId: "design",
  },
  {
    id: "presets",
    title: "Presets",
    body: [
      "Presets now live in the Design system panel — open it from the swatch-book icon in the toolbar (it shares the panel with the page's design tokens). They cover all eight Design-tab style sections (Position / Layout / Appearance / Typography / Fill / Stroke / Effects / Motion), with one preset seeded per kind so the JSON export shows the full schema.",
      "Save the currently-selected element's relevant CSS properties under a name + kind. Apply any saved preset back to a different element with one click. Edit a preset to rename / change properties / drop fields. Delete (with confirmation) to remove. Import / Export bring presets to a JSON file for sharing.",
    ],
    tryIt:
      "Open the swatch-book (Design system) icon and find the Presets list. Apply a seeded preset to the block below, then save the block's current styles as a new preset.",
    targetId: "presets",
  },
  {
    id: "changes",
    title: "Changes panel",
    body: [
      "Every edit is tracked in the Changes tab — grouped by element with friendly group labels (preset / multi-select / visibility) when one action touched many properties at once. The 'View Original' / 'View Changes' toggle previews the page with or without your edits.",
      "Per-change actions: Revert (trash icon, actually reverses the change on the page), Batch apply (zap icon, applies the change to all matching elements with a count badge ×N). Clear All wipes everything in one click.",
      "Export / Import move the whole diff to and from a JSON file, so a session can be saved, shared, or replayed on another page. Export CSS (Alt+E) copies the generated stylesheet for the session straight to your clipboard.",
    ],
    tryIt:
      "Switch to the Changes tab after making edits in the previous sections. Click 'View Original' to flip back. Try Batch apply (zap) on a style change, then Export to download the diff as JSON.",
  },
  {
    id: "action-row",
    title: "Action row",
    body: [
      "Above the tabs sits the toolbar — a row of contextual buttons that act on the current selection or the whole page: Parent / Child (walk the DOM up and down), Duplicate / Remove, Comment, Pause animations, Screenshot, the Design system panel (swatch-book), and Undo / Redo. Most need a layer selected; Pause, Screenshot, Design system, and Undo / Redo are always available.",
      "Pause animations is just one of them — it freezes every running CSS animation and transition on the page so you can inspect a single frame. The pulsing badge below keeps animating until you hit it.",
    ],
    tryIt:
      "Select the badge below, then walk up to its group with Parent and back down with Child. Duplicate it, then Remove the copy. Finally hit Pause animations — the badge freezes; click again to resume.",
    targetId: "action-row",
  },
  {
    id: "settings",
    title: "Settings",
    body: [
      "Click the gear icon in the panel header to open Settings. Pick your color format (HEX / RGB), capture mode for screenshots (clipboard / download / both), and toggle MCP auto-connect.",
    ],
    tryIt:
      "Open Settings. Switch the color format from HEX to RGBA. Notice how color values in the Design tab re-render in the chosen format.",
  },
  {
    id: "theme",
    title: "Theme",
    body: [
      "The side panel has its own theme (light / dark / system) — independent of the page you're editing. The theme switcher in the panel header cycles through the three.",
      "System mode follows your OS dark-mode setting and updates live when it changes.",
    ],
    tryIt:
      "Click the moon / sun icon in the panel header to flip between dark and light themes.",
  },
  {
    id: "mcp",
    title: "MCP server",
    body: [
      "Design Mode ships with an optional MCP companion that bridges the extension to your coding agent (Claude Code, Cursor, etc.). With MCP running and an agent connected, your changes can be sent live with one click instead of being copied through the clipboard.",
      "MCP configuration lives on its own dedicated page inside the extension — not in Settings. Click the MCP chip in the panel header (its trailing chevron opens the page) to pick a connection mode, watch status, and manage the token.",
      "Three connection modes: Cloud (default, hosted relay, no install), Local (a companion server on your machine, started with npm start), and Self-hosted (the same relay code on infrastructure you run).",
    ],
    tryIt:
      "Click the MCP chip in the panel header to open the dedicated MCP page. From the repo root: `npm start --prefix packages/mcp-local` for Local mode. Watch the chip flip from offline (grey) to running to connected once your agent attaches.",
    nextLink: { label: "Read the full MCP setup guide →", href: "/mcp" },
  },
  {
    id: "copy-prompt",
    title: "Copy as Prompt",
    body: [
      "At the bottom of the side panel, Copy as Prompt builds a markdown summary of every tracked change — element selectors, before/after CSS, text edits, DOM operations, and any comments — and copies it to the clipboard. Paste into your agent or chat of choice.",
      "When source detection finds a React component, the prompt also includes a file:line hint so the agent can land on the right source.",
    ],
    tryIt:
      "After making a few edits in this demo, click Copy as Prompt at the bottom of the panel. Paste into a text editor to see the markdown payload.",
  },
  {
    id: "send-to-agent",
    title: "Send to Agent",
    body: [
      "Send to Agent opens a step-based guided modal — confirm the connection, review what's about to ship, then push it over MCP. No clipboard round-trip. Enabled when MCP is running AND an agent is connected; the button's tooltip names the specific blocker if either is missing.",
      "Once you send, get_changes and get_session_summary expose a real handoff field, so the agent's next read knows this batch of edits is the one you just approved — an explicit 'these are ready' signal instead of the agent guessing.",
      "This is the fastest path from 'I just designed it in the browser' to 'the source code is now updated'.",
      "Haven't set up an agent yet? The MCP tour walks you through all three connection modes (Local, Cloud, Self-hosted) with copy-paste config snippets for Claude Desktop, Cursor, and Claude Code — `Set up your agent →` link below.",
    ],
    tryIt:
      "With MCP running and your agent attached, click Send to Agent and step through the guided modal. The agent receives a structured message with every change in this demo session, flagged via the handoff field.",
    nextLink: { label: "Set up your agent →", href: "/mcp" },
  },
];
