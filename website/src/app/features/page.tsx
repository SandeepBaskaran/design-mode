import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Bookmark,
  Camera,
  Copy,
  CornerUpLeft,
  Eye,
  EyeOff,
  Folder,
  Layers,
  Layers3,
  MessageCircle,
  MousePointer2,
  MoveHorizontal,
  MoveVertical,
  Pause,
  Send,
  Sparkles,
  Square,
  Type,
} from "lucide-react";

import { Background } from "@/components/background";
import { DashedLine } from "@/components/dashed-line";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = {
  title: "Features",
  description:
    "Every control inside the Design Mode side panel — header row, three middle panels (Layers, Design, Changes), and the bottom row that ships your edits to your agent.",
};

const headerItems = [
  {
    icon: MousePointer2,
    title: "Activate + Inspect",
    description:
      "Toggle the extension on, then hover to highlight elements and click to lock selection.",
  },
  {
    icon: Square,
    title: "Selected element chip",
    description:
      "Shows the live selector (tag + nearest id/class). Click the chip to focus the matching layer in the Layers tab.",
  },
  {
    icon: Sparkles,
    title: "Open in CSS",
    description:
      "Pop the full computed-style sheet for the current selection in an overlay — same view DevTools gives you, only readable.",
  },
];

const actionItems = [
  { icon: ArrowUp, title: "Parent / Child", description: "Walk selection up and down the DOM tree." },
  { icon: ArrowDown, title: "Duplicate / Delete", description: "DOM mutations recorded as undoable changes." },
  { icon: MessageCircle, title: "Comment", description: "Drop a numbered sticky-pin on the selected element." },
  { icon: EyeOff, title: "Hide all pins", description: "Mute every comment pin overlay in one click." },
  { icon: Pause, title: "Freeze animations", description: "Pause every CSS/JS animation on the page so you can edit mid-state." },
  { icon: Camera, title: "Screenshot", description: "Capture the visible tab to clipboard, download, or both." },
  { icon: Bookmark, title: "Presets", description: "Save and reapply styles across all nine Design-tab sections." },
  { icon: CornerUpLeft, title: "Undo / Redo", description: "Step backward and forward through every style, text, and DOM change." },
];

const designSections = [
  { icon: Type, label: "Typography" },
  { icon: AlignLeft, label: "Position" },
  { icon: Layers, label: "Layout" },
  { icon: MoveVertical, label: "Size & spacing" },
  { icon: Square, label: "Border" },
  { icon: Eye, label: "Appearance" },
  { icon: Sparkles, label: "Effects" },
  { icon: MoveHorizontal, label: "Motion" },
  { icon: Folder, label: "Variants" },
];

export default function FeaturesPage() {
  return (
    <Background>
      <section className="py-28 lg:py-32 lg:pt-44">
        {/* Hero */}
        <div className="container max-w-5xl">
          <h1 className="text-3xl tracking-tight sm:text-4xl md:text-5xl">
            Every control, where you need it
          </h1>
          <p className="text-muted-foreground mt-4 max-w-3xl text-lg md:text-xl">
            The Design Mode side panel is split into three rows. A header
            row to pick what you're working on, three middle panels for
            the actual editing, and a bottom row that ships your edits
            to your AI coding agent.
          </p>
        </div>

        <DashedLine className="container mt-16 max-w-5xl" />

        {/* Header row */}
        <div className="container mt-16 max-w-5xl">
          <div className="mb-8 flex items-baseline gap-3">
            <span className="text-muted-foreground font-mono text-xs tracking-wide uppercase">
              Row 1
            </span>
            <h2 className="text-2xl tracking-tight md:text-3xl">
              Header — pick what you're editing
            </h2>
          </div>
          <p className="text-muted-foreground mb-10 max-w-2xl">
            The top of the panel always shows what's selected, gives you
            access to the raw computed CSS, and houses the per-tab
            theme + Contribute + Help + Settings overlays.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            {headerItems.map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.title}>
                  <CardContent className="flex flex-col gap-2 p-5">
                    <Icon className="text-foreground size-5" />
                    <h3 className="text-base font-semibold">{item.title}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {item.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        <DashedLine className="container mt-20 max-w-5xl" />

        {/* Three panels */}
        <div className="container mt-16 max-w-5xl">
          <div className="mb-8 flex items-baseline gap-3">
            <span className="text-muted-foreground font-mono text-xs tracking-wide uppercase">
              Row 2
            </span>
            <h2 className="text-2xl tracking-tight md:text-3xl">
              Three panels — the editing surface
            </h2>
          </div>
          <p className="text-muted-foreground mb-10 max-w-2xl">
            Layers, Design, and Changes. Each tab is its own scrollable
            surface; switching keeps the selection alive.
          </p>

          <div className="grid gap-6 md:grid-cols-3">
            {/* Layers */}
            <Card>
              <CardContent className="flex h-full flex-col gap-3 p-6">
                <Layers className="text-foreground size-5" />
                <h3 className="text-lg font-semibold">Layers</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Full DOM tree of the page you're editing. Search,
                  expand/collapse, multi-select, drag rows to
                  rearrange the actual document, toggle visibility
                  with an eye icon per row.
                </p>
                <ul className="text-muted-foreground mt-2 space-y-1 text-sm">
                  <li>• Search by tag, class, id, or text</li>
                  <li>• Drag to reorder · drop on a row to nest</li>
                  <li>• Multi-select for batch edits</li>
                  <li>• Indentation guides + collapse</li>
                </ul>
              </CardContent>
            </Card>

            {/* Design */}
            <Card className="outline-primary outline-4">
              <CardContent className="flex h-full flex-col gap-3 p-6">
                <Sparkles className="text-foreground size-5" />
                <h3 className="text-lg font-semibold">Design</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Nine sections, Figma-aligned. Every input is a real
                  control — sliders, colour pickers, segmented buttons —
                  not a textarea of CSS.
                </p>
                <ul className="mt-2 grid grid-cols-1 gap-1 text-sm">
                  {designSections.map((s) => {
                    const Icon = s.icon;
                    return (
                      <li
                        key={s.label}
                        className="text-muted-foreground flex items-center gap-2"
                      >
                        <Icon className="size-3.5" />
                        {s.label}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>

            {/* Changes */}
            <Card>
              <CardContent className="flex h-full flex-col gap-3 p-6">
                <Layers3 className="text-foreground size-5" />
                <h3 className="text-lg font-semibold">Changes</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Every style, text, DOM, and comment edit collected in
                  reverse-chronological order. Group by selector, filter
                  by kind, search by value, resolve or revert anything.
                </p>
                <ul className="text-muted-foreground mt-2 space-y-1 text-sm">
                  <li>• Sticky search + filter chips header</li>
                  <li>• Numbered pin badges match the page overlay</li>
                  <li>• Resolve / Reopen / Edit / Delete per row</li>
                  <li>• Export / Import as JSON for diff handoff</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>

        <DashedLine className="container mt-20 max-w-5xl" />

        {/* Action row */}
        <div className="container mt-16 max-w-5xl">
          <div className="mb-8 flex items-baseline gap-3">
            <span className="text-muted-foreground font-mono text-xs tracking-wide uppercase">
              Row between
            </span>
            <h2 className="text-2xl tracking-tight md:text-3xl">
              Action toolbar — quick mutations
            </h2>
          </div>
          <p className="text-muted-foreground mb-10 max-w-2xl">
            A row of single-purpose buttons between the header and the
            three tabs. Each is either a DOM mutation or a session-wide
            toggle.
          </p>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {actionItems.map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.title}>
                  <CardContent className="flex flex-col gap-2 p-4">
                    <div className="flex items-center gap-2">
                      <Icon className="text-foreground size-4" />
                      <h3 className="text-sm font-semibold">{item.title}</h3>
                    </div>
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      {item.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        <DashedLine className="container mt-20 max-w-5xl" />

        {/* Bottom row */}
        <div className="container mt-16 max-w-5xl">
          <div className="mb-8 flex items-baseline gap-3">
            <span className="text-muted-foreground font-mono text-xs tracking-wide uppercase">
              Row 3
            </span>
            <h2 className="text-2xl tracking-tight md:text-3xl">
              Bottom — hand off to your agent
            </h2>
          </div>
          <p className="text-muted-foreground mb-10 max-w-2xl">
            The sticky bottom of the panel collapses all your edits into
            one shippable diff. Two buttons, no ceremony.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardContent className="flex flex-col gap-2 p-6">
                <div className="flex items-center gap-2">
                  <Copy className="text-foreground size-5" />
                  <h3 className="text-lg font-semibold">Copy Prompt</h3>
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Bundles every change into a Markdown export
                  (selector → property → value lines) and writes it to
                  your clipboard. Paste into whichever agent you use.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col gap-2 p-6">
                <div className="flex items-center gap-2">
                  <Send className="text-foreground size-5" />
                  <h3 className="text-lg font-semibold">Send to Agent</h3>
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Pushes the same Markdown straight to the connected
                  MCP agent — Claude Desktop, Cursor, Claude Code, or
                  any MCP-aware tool.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </Background>
  );
}
