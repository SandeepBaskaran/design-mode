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
  HeartHandshake,
  HelpCircle,
  Layers,
  Layers3,
  MessageCircle,
  MoveHorizontal,
  MoveVertical,
  Pause,
  Plug,
  Send,
  Settings as SettingsIcon,
  SunMoon,
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

const headerIcons = [
  {
    icon: Plug,
    title: "MCP status",
    description:
      "Click-to-refresh chip showing whether the MCP server is offline, running, or has an agent attached.",
  },
  {
    icon: SunMoon,
    title: "Theme",
    description: "Toggle the side panel between system / light / dark.",
  },
  {
    icon: HeartHandshake,
    title: "Contribute",
    description:
      "Star the repo, share, sponsor — full overlay with low-friction ways to support the project.",
  },
  {
    icon: HelpCircle,
    title: "Help",
    description:
      "Quick links to docs, privacy, and a one-click “Copy diagnostics” for bug reports.",
  },
  {
    icon: SettingsIcon,
    title: "Settings",
    description:
      "Theme, colour format, capture mode, inspector colours, and the MCP mode picker (Cloud / Local / Self-hosted).",
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
    <>
      {/* Hero — yellow background confined to this slab */}
      <Background>
        <section className="py-28 lg:py-32 lg:pt-44">
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
        </section>
      </Background>

      {/* Middle — plain background */}
      <section className="py-16 lg:py-20">
        <DashedLine className="container max-w-5xl" />

        {/* Section 1: Header row + Action toolbar (one merged card) */}
        <div className="container mt-16 max-w-5xl">
          <div className="mb-8 flex items-baseline gap-3">
            <span className="text-muted-foreground font-mono text-xs tracking-wide uppercase">
              Row 1
            </span>
            <h2 className="text-2xl tracking-tight md:text-3xl">
              Top of the panel
            </h2>
          </div>
          <p className="text-muted-foreground mb-10 max-w-2xl">
            Five icons set up your session and surface the overlays
            (Contribute, Help, Settings). Just below them, an action
            toolbar puts the most-used DOM and session mutations one
            click away.
          </p>

          <Card>
            <CardContent className="grid gap-8 p-6 md:grid-cols-2 md:p-8">
              <div>
                <h3 className="text-foreground mb-4 text-base font-semibold">
                  Header icons
                </h3>
                <ul className="space-y-3">
                  {headerIcons.map((item) => {
                    const Icon = item.icon;
                    return (
                      <li
                        key={item.title}
                        className="flex items-start gap-3"
                      >
                        <Icon className="text-foreground mt-0.5 size-4 shrink-0" />
                        <div>
                          <div className="text-foreground text-sm font-semibold">
                            {item.title}
                          </div>
                          <div className="text-muted-foreground text-sm leading-relaxed">
                            {item.description}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div>
                <h3 className="text-foreground mb-4 text-base font-semibold">
                  Action toolbar
                </h3>
                <ul className="space-y-3">
                  {actionItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <li
                        key={item.title}
                        className="flex items-start gap-3"
                      >
                        <Icon className="text-foreground mt-0.5 size-4 shrink-0" />
                        <div>
                          <div className="text-foreground text-sm font-semibold">
                            {item.title}
                          </div>
                          <div className="text-muted-foreground text-sm leading-relaxed">
                            {item.description}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>

        <DashedLine className="container mt-20 max-w-5xl" />

        {/* Section 2: Three middle panels */}
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

            <Card className="outline-primary outline-4">
              <CardContent className="flex h-full flex-col gap-3 p-6">
                <Sparkles className="text-foreground size-5" />
                <h3 className="text-lg font-semibold">Design</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Nine sections, Figma-aligned. Every input is a real
                  control — sliders, colour pickers, segmented buttons —
                  not a textarea of CSS.
                </p>
                <ul className="mt-2 grid grid-cols-1 gap-1.5 text-sm">
                  {designSections.map((s) => {
                    const Icon = s.icon;
                    return (
                      <li
                        key={s.label}
                        className="text-foreground/90 flex items-center gap-2"
                      >
                        <Icon className="text-foreground/70 size-3.5" />
                        {s.label}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>

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
      </section>

      {/* Bottom — yellow background slab */}
      <Background variant="bottom">
        <section className="py-20 lg:py-28">
          <DashedLine className="container max-w-5xl" />
          <div className="container mt-16 max-w-5xl">
            <div className="mb-8 flex items-baseline gap-3">
              <span className="text-muted-foreground font-mono text-xs tracking-wide uppercase">
                Row 3
              </span>
              <h2 className="text-2xl tracking-tight md:text-3xl">
                Bottom — ship your edits
              </h2>
            </div>
            <p className="text-muted-foreground mb-10 max-w-2xl">
              Two buttons. The only two ways your changes leave the panel
              — one to the clipboard, one to a connected AI coding agent.
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
                    your clipboard. Paste into whichever agent you use —
                    works without any MCP setup.
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
                    any MCP-aware tool. Enables once an agent is actually
                    attached; greyed out otherwise.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </Background>
    </>
  );
}
