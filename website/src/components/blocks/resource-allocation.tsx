import {
  AlignLeft,
  ArrowUpDown,
  Bookmark,
  Camera,
  CircleDot,
  Clipboard,
  Copy,
  CornerUpLeft,
  Eye,
  EyeOff,
  Folder,
  HeartHandshake,
  HelpCircle,
  Layers,
  Layers3,
  Link as LinkIcon,
  MessageCircle,
  MoveHorizontal,
  MoveVertical,
  Pause,
  Send,
  Settings as SettingsIcon,
  Sparkles,
  Square,
  SunMoon,
  Type,
} from "lucide-react";

import { DashedLine } from "../dashed-line";

import { cn } from "@/lib/utils";

type CardItem = {
  title: string;
  description: string;
  groups?: Array<{
    label: string;
    items: Array<{ icon: React.ElementType; label: string }>;
  }>;
  bullets?: Array<{ icon: React.ElementType; label: string }>;
  highlight?: boolean;
  className?: string;
};

const topItems: CardItem[] = [
  {
    title: "Top bar — everything around the editor.",
    description:
      "A header row of overlay icons and an action toolbar that sits just above the three editing panels.",
    groups: [
      {
        label: "Header icons",
        items: [
          { icon: LinkIcon, label: "MCP status" },
          { icon: SunMoon, label: "Theme" },
          { icon: HeartHandshake, label: "Contribute" },
          { icon: HelpCircle, label: "Help" },
          { icon: SettingsIcon, label: "Settings" },
        ],
      },
      {
        label: "Action toolbar",
        items: [
          { icon: ArrowUpDown, label: "Parent / Child" },
          { icon: Copy, label: "Duplicate / Delete" },
          { icon: MessageCircle, label: "Comment" },
          { icon: EyeOff, label: "Hide pins" },
          { icon: Pause, label: "Freeze animations" },
          { icon: Camera, label: "Screenshot" },
          { icon: Bookmark, label: "Presets" },
          { icon: CornerUpLeft, label: "Undo / Redo" },
        ],
      },
    ],
    className: "flex-1",
  },
  {
    title: "Bottom buttons — ship your edits.",
    description:
      "Two buttons collapse every change in the session into a shippable diff. Copy Prompt goes to the clipboard; Send to Agent goes over MCP to a connected coding agent.",
    bullets: [
      { icon: Clipboard, label: "Copy Prompt — Markdown diff to clipboard (no MCP needed)" },
      { icon: Send, label: "Send to Agent — same payload, straight to Claude / Cursor / Claude Code" },
      { icon: CircleDot, label: "Send enables only once an agent is actually attached" },
    ],
    className: "flex-1",
  },
];

const bottomItems: CardItem[] = [
  {
    title: "Layers tab.",
    description:
      "See and reorganise the DOM tree of the page you're editing — without leaving the side panel.",
    bullets: [
      { icon: Layers, label: "Search by tag, class, id, text" },
      { icon: ArrowUpDown, label: "Drag to reorder · drop on a row to nest" },
      { icon: Eye, label: "Per-row visibility toggle" },
      { icon: Square, label: "Multi-select for batch edits" },
    ],
  },
  {
    title: "Design tab.",
    description:
      "Nine Figma-aligned sections. Real controls — sliders, colour pickers, segmented buttons — not a textarea of CSS.",
    highlight: true,
    bullets: [
      { icon: Type, label: "Typography" },
      { icon: AlignLeft, label: "Position" },
      { icon: Layers, label: "Layout" },
      { icon: MoveVertical, label: "Size & spacing" },
      { icon: Square, label: "Border" },
      { icon: Eye, label: "Appearance" },
      { icon: Sparkles, label: "Effects" },
      { icon: MoveHorizontal, label: "Motion" },
      { icon: Folder, label: "Variants" },
    ],
  },
  {
    title: "Changes tab.",
    description:
      "A full audit trail of every style, text, and DOM edit. Undo any one of them, or export the whole diff.",
    bullets: [
      { icon: Layers3, label: "Sticky search + filter chips header" },
      { icon: CircleDot, label: "Numbered pin badges match the page overlay" },
      { icon: Copy, label: "Resolve / Reopen / Edit / Delete per row" },
      { icon: Send, label: "Export / Import as JSON for diff handoff" },
    ],
  },
];

export const ResourceAllocation = () => {
  return (
    <section
      id="resource-allocation"
      className="overflow-hidden pb-28 lg:pb-32"
    >
      <div>
        <h2 className="container text-center text-3xl tracking-tight text-balance sm:text-4xl md:text-5xl lg:text-6xl">
          Every design control, in one side panel
        </h2>

        <div className="mt-8 md:mt-12 lg:mt-20">
          <DashedLine
            orientation="horizontal"
            className="container scale-x-105"
          />

          {/* Top row - 2 cards */}
          <div className="relative container flex max-md:flex-col">
            {topItems.map((item, i) => (
              <Item key={i} item={item} isLast={i === topItems.length - 1} />
            ))}
          </div>

          <DashedLine
            orientation="horizontal"
            className="container max-w-7xl scale-x-110"
          />

          {/* Bottom row - 3 cards */}
          <div className="relative container grid max-w-7xl md:grid-cols-3">
            {bottomItems.map((item, i) => (
              <Item
                key={i}
                item={item}
                isLast={i === bottomItems.length - 1}
                className="md:pb-0"
              />
            ))}
          </div>
        </div>

        <DashedLine
          orientation="horizontal"
          className="container max-w-7xl scale-x-110"
        />
      </div>
    </section>
  );
};

interface ItemProps {
  item: CardItem;
  isLast?: boolean;
  className?: string;
}

const Item = ({ item, isLast, className }: ItemProps) => {
  return (
    <div
      className={cn(
        "relative flex flex-1 flex-col px-0 py-6 md:px-6 md:py-8",
        item.highlight && "md:bg-primary/5",
        className,
        item.className,
      )}
    >
      <div className="text-balance">
        <h3 className="text-foreground inline text-base font-semibold">
          {item.title}{" "}
        </h3>
        <span className="text-muted-foreground"> {item.description}</span>
      </div>

      {/* Groups (only for the top-bar card) */}
      {item.groups && (
        <div className="mt-5 flex flex-col gap-5 md:mt-6 md:flex-row md:gap-8">
          {item.groups.map((g) => (
            <div key={g.label} className="flex-1">
              <div className="text-muted-foreground mb-3 font-mono text-[10px] tracking-wide uppercase">
                {g.label}
              </div>
              <ul className="space-y-1.5">
                {g.items.map((entry) => {
                  const Icon = entry.icon;
                  return (
                    <li
                      key={entry.label}
                      className="text-foreground/90 flex items-center gap-2 text-sm"
                    >
                      <Icon className="text-foreground/70 size-3.5 shrink-0" />
                      {entry.label}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Flat bullets (Layers / Design / Changes / Bottom buttons) */}
      {item.bullets && (
        <ul className="mt-5 space-y-1.5 md:mt-6">
          {item.bullets.map((entry) => {
            const Icon = entry.icon;
            return (
              <li
                key={entry.label}
                className="text-foreground/90 flex items-start gap-2 text-sm"
              >
                <Icon className="text-foreground/70 mt-0.5 size-3.5 shrink-0" />
                <span>{entry.label}</span>
              </li>
            );
          })}
        </ul>
      )}

      {!isLast && (
        <>
          <DashedLine
            orientation="vertical"
            className="absolute top-0 right-0 max-md:hidden"
          />
          <DashedLine
            orientation="horizontal"
            className="absolute inset-x-0 bottom-0 md:hidden"
          />
        </>
      )}
    </div>
  );
};
