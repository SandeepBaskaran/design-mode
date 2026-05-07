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
      "The crosshair icon at the top of the side panel toggles inspector mode. Hover any element on the page and you'll see a yellow outline; click to select it and the Design tab fills with that element's properties.",
      "Hovering shows the layer in the panel's indicator chip as 'Hovering'. Clicking flips it to 'Selected' and locks the focus on that layer.",
    ],
    tryIt:
      "Click the crosshair in the side panel header, then hover over the card below. Click the card to select it.",
    targetId: "inspector",
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
      "Effects are layered: drop shadow, inner shadow, layer blur, background blur. Each entry is independent. Below the effect list, a Motion subsection holds transition, animation, and transform components.",
    ],
    tryIt:
      "Select the floating card below. Click the + in the Effects header, then 'Drop shadow'. Tweak the X/Y/blur/spread to taste.",
    targetId: "design-effects",
    parentId: "design",
  },
  {
    id: "changes",
    title: "Changes panel",
    body: [
      "Every edit you make is tracked in the Changes tab — grouped by element. The 'View Original' / 'View Changes' toggle lets you preview the page with or without your edits. Per-change actions: Revert (trash icon), Batch apply (zap icon, applies the change to all matching elements with a count badge ×N).",
      "Clear All wipes everything in one click.",
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
    ],
    tryIt:
      "With MCP running and your agent attached, click Send to Agent. The agent receives a structured message with every change in this demo session.",
  },
];
