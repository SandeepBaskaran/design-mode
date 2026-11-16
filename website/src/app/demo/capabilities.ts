export type CapabilityGroup = {
  title: string;
  items: string[];
};

// Shipped in 3.2.2. Sources are named in the demo page, not repeated on every line.
export const capabilityGroups: CapabilityGroup[] = [
  {
    title: "Inspect and arrange",
    items: [
      "Inspect, hover and select an element. Shift or Cmd/Ctrl click selects several.",
      "Select matching layers by tag and class.",
      "Measure gaps, drag eight resize handles, and distribute a multi-selection.",
      "Search, reorder and hide layers. An empty Layers list has a Reload button.",
    ],
  },
  {
    title: "Design the selected element",
    items: [
      "Position, layout, appearance, typography, fill, stroke, effects, motion and layout guides.",
      "Icon and media sections, design tokens, and presets in the design-system panel.",
      "Contrast readout on text colour. Corner shape on Chromium that supports it.",
    ],
  },
  {
    title: "Notes, changes and hand-off",
    items: [
      "Comment pins (Alt+C) and drawn region notes (Alt+R).",
      "Copy as Prompt includes a region note’s size and position.",
      "Export stays JSON unless a region note exists, then it downloads a zip with one PNG per region.",
      "A new region note is not marked stale while its anchor element or the current page is still present.",
      "Changes can be reviewed, reverted, imported, or copied as CSS (Alt+X).",
      "Send to Agent explains a missing setup step without discarding edits.",
    ],
  },
  {
    title: "Panel, browsers and the CLI",
    items: [
      "Screenshot is Alt+Shift+S. Option+S on a Mac stays free for accented letters.",
      "Chrome can dock, pop out, or pin on top. Firefox uses its sidebar and needs Firefox 140 or later.",
      "Safari on Mac installs from the latest GitHub release as a temporary Web Inspector extension.",
      "designmode-app version prints the installed CLI version without a network call or a token.",
    ],
  },
];
