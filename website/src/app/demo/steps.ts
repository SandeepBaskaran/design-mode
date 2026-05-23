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
      "First time? Pin the extension to your toolbar so it's always one click away. Then use the keyboard shortcut Alt+D (Option+D on macOS) to open the side panel on this page.",
    ],
    tryIt:
      "Pin Design Mode in your Chrome toolbar, then press Alt+D on this page. The side panel should open on the right.",
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
    id: "measure-resize",
    title: "Measure & resize",
    body: [
      "Inspect mode doubles as a measuring tool. Hovering an element draws dashed guide lines through its edges, spanning the page, so you can read alignment at a glance.",
      "With one element selected, hover another and edge-to-edge distance pills appear — the gap between them plus the side offsets, exactly like VisBug or Figma's measure tool. Shift-click extra elements to see the pixel spacing between them.",
      "The selected element also gets 8 drag handles (four corners + four edge midpoints). Drag any of them to resize live; the new width and height ship straight into the Changes tab and the CSS export, so your agent gets the exact dimensions.",
    ],
    tryIt:
      "Select the card below, then hover the elements around it to read the spacing. Grab a corner handle and drag to resize.",
  },
  {
    id: "layers",
    title: "Layers panel",
    body: [
      "The Layers tab shows the page's DOM as a tree. Search by tag, class, id, or smart name. Drag layers to reorder them. Toggle visibility with the eye icon. Multi-select to apply edits to several layers at once.",
      "Each row shows: indentation guide, drag handle, expand/collapse chevron, tag icon, smart name, and a hover-revealed eye toggle.",
    ],
    tryIt:
      "Switch to the Layers tab. Try the search input — type 'card' or 'demo'. Drag-reorder one of the list items below.",
    targetId: "layers",
  },
  {
    id: "design",
    title: "Design panel",
    body: [
      "The Design tab is where you edit a selected layer's properties. It mirrors Figma's section order — Position → Layout → Appearance → Typography → Fill → Stroke → Effects — so the mental model carries over.",
      "Sections only render for relevant layer kinds: Typography appears on text layers, Layout hides for media, etc. The next 8 sub-sections walk through each.",
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
      "Position handles where a layer sits inside its parent: position type (static / relative / absolute / fixed / sticky), object alignment, X/Y/Z, rotation, flip, and 3D transforms in Advanced.",
      "Try aligning the card to the right edge using the alignment buttons. Try rotating it 90° with the quick-rotate icon. Try flipping it horizontally.",
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
      "Appearance covers opacity, blend mode, corner radius, and the color-adjust filters (brightness, contrast, saturate, hue-rotate, grayscale, invert, sepia).",
      "The corner radius has a primary input + a scan toggle that expands a 2×2 grid for individual corners. Click the scan icon and try unequal corners.",
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
      "Typography is shown for text-bearing layers (h1-h6, p, span, a, button, label, …). Pick from page-discovered fonts, set weight, size, line-height, letter-spacing, color. Toggle bold / italic / underline / strikethrough. Choose case, alignment, and list style.",
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
      "Split out from Effects into its own section — Transition, Animation, Transform, Motion path, View transition, Scroll-driven animation. Each editor surfaces every CSS longhand the relevant property exposes, plus a Preview button for transitions and animations.",
      "The section starts collapsed by default so the design tab stays compact; expand the chevron next to 'Motion' in the side panel to use it.",
    ],
    tryIt:
      "Select the floating card. Expand Motion. Click + → 'Transition', set duration 0.3s, then change the card's background colour — watch it ease into the new value. Click + → 'Animation' and pick a built-in dm-fade-in keyframe to preview a one-shot animation.",
    targetId: "design-motion",
    parentId: "design",
  },
  {
    id: "design-layout-guide",
    title: "Layout guide",
    body: [
      "Figma-style overlay of Columns / Rows / Grid bars on the selected element. Renders as a ::before pseudo-element so it doesn't touch layout; per-element session memory means the bars stay configured when you reselect the element.",
      "Each row carries a kind dropdown, count (or cell size for Grid), settings expand, eye, and trash. Settings opens a 3×2 grid for Columns/Rows (Colour + Opacity / Align + Size / Margin + Gutter) or 1×2 for Grid (Colour + Opacity). The section header's eye toggles every guide on the element without losing the row config.",
    ],
    tryIt:
      "Select the full-width container below. Open Layout guide → click Add → keep Columns kind, count 12, default 10% red. Toggle the section eye to hide and re-show the overlay. Drag to add a second guide row for Rows.",
    targetId: "design-layout-guide",
    parentId: "design",
  },
  {
    id: "presets",
    title: "Presets",
    body: [
      "Open with the bookmark icon in the action row. Presets covers all nine Design-tab sections (Position / Layout / Appearance / Typography / Fill / Stroke / Effects / Motion / Layout guide), with one preset seeded per kind so the JSON export shows the full schema.",
      "Save the currently-selected element's relevant CSS properties under a name + kind. Apply any saved preset back to a different element with one click. Edit a preset to rename / change properties / drop fields. Delete (with confirmation) to remove. Import / Export bring presets to a JSON file for sharing.",
    ],
    tryIt:
      "Open the bookmark icon. Browse the seeded presets — apply 'Headline 1' to a heading on the page, then save the current card's styles as a new 'Card · Soft' preset under the Effects kind.",
  },
  {
    id: "changes",
    title: "Changes panel",
    body: [
      "Every edit is tracked in the Changes tab — grouped by element with friendly group labels (preset / multi-select / visibility) when one action touched many properties at once. The 'View Original' / 'View Changes' toggle previews the page with or without your edits.",
      "Per-change actions: Revert (trash icon, actually reverses the change on the page), Batch apply (zap icon, applies the change to all matching elements with a count badge ×N). Clear All wipes everything in one click.",
    ],
    tryIt:
      "Switch to the Changes tab after making edits in the previous sections. Click 'View Original' to flip back. Try Batch apply (zap) on a style change.",
  },
  {
    id: "action-row",
    title: "Action row",
    body: [
      "Above the tabs sits a row of contextual buttons: Parent / Child (DOM navigation), Duplicate / Remove, Comment, Pause animations, Screenshot, Presets, Undo / Redo. Most need a layer to be selected; Pause / Screenshot / Presets / Undo / Redo are always available.",
    ],
    tryIt:
      "Try the Pause icon in the action row — the animated badge below should freeze. Click again to resume.",
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
      "Design Mode ships with an optional MCP companion that bridges the extension to your coding agent (Claude Code, Cursor, etc.) over a local WebSocket. With MCP running and an agent connected, your changes can be sent live with one click instead of being copied through the clipboard.",
      "Start it from the repo root with npm start. The panel header indicator turns green when an agent is connected.",
    ],
    tryIt:
      "From the repo root: `npm start --prefix packages/mcp-local`. In the panel header, watch the MCP indicator flip from offline (grey) to running (yellow) to connected (green) once your agent attaches.",
  },
  {
    id: "copy-prompt",
    title: "Copy Prompt",
    body: [
      "At the bottom of the side panel, Copy Prompt builds a markdown summary of every tracked change — element selectors, before/after CSS, text edits, DOM operations, and any comments — and copies it to the clipboard. Paste into your agent or chat of choice.",
      "When source detection finds a React component, the prompt also includes a file:line hint so the agent can land on the right source.",
    ],
    tryIt:
      "After making a few edits in this demo, click Copy Prompt at the bottom of the panel. Paste into a text editor to see the markdown payload.",
  },
  {
    id: "send-to-agent",
    title: "Send to Agent",
    body: [
      "Send to Agent pushes the same Copy Prompt payload directly to a connected coding agent over MCP — no clipboard round-trip. Enabled when MCP is running AND an agent is connected. The button's tooltip names the specific blocker if either is missing.",
      "This is the fastest path from 'I just designed it in the browser' to 'the source code is now updated'.",
      "Haven't set up an agent yet? The MCP tour walks you through all three connection modes (Local, Cloud, Self-hosted) with copy-paste config snippets for Claude Desktop, Cursor, and Claude Code — `Set up your agent →` link below.",
    ],
    tryIt:
      "With MCP running and your agent attached, click Send to Agent. The agent receives a structured message with every change in this demo session.",
    nextLink: { label: "Set up your agent →", href: "/mcp" },
  },
];
