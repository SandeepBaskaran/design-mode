"use client";

import { Caveat } from "next/font/google";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  ArrowDown,
  ArrowUp,
  Camera,
  ChevronRight,
  Clipboard,
  CirclePause,
  Code,
  Copy,
  Crosshair,
  Droplet,
  ExternalLink,
  Eye,
  HeartHandshake,
  HelpCircle,
  Layers,
  LayoutGrid,
  MessageSquare,
  Moon,
  Move,
  Palette,
  Play,
  Plus,
  Redo,
  Send,
  Settings,
  SlidersHorizontal,
  Sparkles,
  SquareDashed,
  SquareDashedMousePointer,
  SwatchBook,
  Trash,
  Type,
  Undo,
} from "lucide-react";

import styles from "./panel-anatomy.module.css";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const handwriting = Caveat({ subsets: ["latin"], display: "swap" });

const items = [
  {
    title: "Sidepanel",
    lines: [
      "Edit the page without leaving your browser.",
      "Keep your layers, design controls and changes together.",
    ],
  },
  {
    title: "Header",
    lines: [
      "Check MCP status and open connection settings.",
      "Switch theme, get help or pop out the panel in Chrome.",
    ],
  },
  {
    title: "Action bar",
    lines: [
      "Inspect, navigate, duplicate or remove a selected element.",
      "Add comments, capture screenshots and undo edits.",
    ],
  },
  {
    title: "Layers",
    lines: [
      "Find and select elements in the page’s DOM tree.",
      "Reorganise the structure without leaving the panel.",
    ],
  },
  {
    title: "Design",
    lines: [
      "Adjust layout, typography, colour, effects and motion.",
      "Use visual controls to change the selected element.",
    ],
  },
  {
    title: "Changes",
    lines: [
      "Review style, text and structure edits alongside comments.",
      "Undo individual changes or export the full diff.",
    ],
  },
  {
    title: "Footer",
    lines: [
      "Copy your edits as a prompt for your coding agent.",
      "Or send the session to an agent connected through MCP.",
    ],
  },
];

const sections = [
  { title: "Position", icon: Move, actions: [SlidersHorizontal] },
  { title: "Layout", icon: LayoutGrid, actions: [SlidersHorizontal] },
  { title: "Appearance", icon: Droplet, actions: [Eye, SlidersHorizontal] },
  { title: "Typography", icon: Type, actions: [SlidersHorizontal] },
  { title: "Fill", icon: Palette, actions: [SlidersHorizontal] },
  { title: "Stroke", icon: SquareDashed, actions: [] },
  { title: "Effects", icon: Sparkles, actions: [Plus] },
  {
    title: "Motion",
    icon: Play,
    actions: [CirclePause, SlidersHorizontal, Plus],
  },
  { title: "Layout guide", icon: LayoutGrid, actions: [] },
];

const headerNotes = [
  { icon: ChevronRight, text: "MCP status & connection settings" },
  { icon: Moon, text: "Switch light / dark theme" },
  { icon: HeartHandshake, text: "Contribute to Design Mode" },
  { icon: HelpCircle, text: "Help & diagnostics" },
  { icon: Settings, text: "Open settings" },
  { icon: ExternalLink, text: "Pop out a floating window (Chrome)" },
];
const actionNotes = [
  { icon: Crosshair, text: "Inspect an element" },
  { icon: ArrowUp, text: "Select its parent" },
  { icon: ArrowDown, text: "Select its child" },
  { icon: Copy, text: "Duplicate selection" },
  { icon: Trash, text: "Remove selection" },
  { icon: MessageSquare, text: "Add a comment" },
  { icon: SquareDashedMousePointer, text: "Annotate a region" },
  { icon: Camera, text: "Capture a screenshot" },
  { icon: SwatchBook, text: "Open the design system" },
  { icon: Undo, text: "Undo an edit" },
  { icon: Redo, text: "Redo an edit" },
];
const stageNotes = {
  Sidepanel: [
    {
      icon: SlidersHorizontal,
      text: "Your page. All your controls. One place.",
    },
  ],
  Header: headerNotes,
  "Action bar": actionNotes,
  Layers: [
    { icon: Layers, text: "A real page has a tree. Find your element here." },
  ],
  Design: [
    {
      icon: SlidersHorizontal,
      text: "Layout, type, colour & motion — on the selected element.",
    },
  ],
  Changes: [
    {
      icon: Sparkles,
      text: "The before, the after, and the context for your agent.",
    },
  ],
  Footer: [
    {
      icon: Clipboard,
      text: "Copy as Prompt — paste your edits into a coding agent.",
    },
    {
      icon: Send,
      text: "Send to your AI agent — hand off over a connected MCP session.",
    },
  ],
};
const noteGroups = {
  Header: [
    { label: "Connection & theme", start: 0, end: 3 },
    { label: "Help & settings", start: 3, end: 6 },
  ],
  "Action bar": [
    { label: "Select", start: 0, end: 3 },
    { label: "Edit & capture", start: 3, end: 8 },
    { label: "System & history", start: 8, end: 11 },
  ],
};

function Annotations({ active, ready }: { active: string; ready: boolean }) {
  const [group, setGroup] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const [routes, setRoutes] = useState<string[]>([]);
  const notes = stageNotes[active as keyof typeof stageNotes];
  const groups = noteGroups[active as keyof typeof noteGroups];
  const selection = groups?.[group];

  useLayoutEffect(() => {
    if (!ready || !root.current) return;
    const measure = () => {
      const scene = root.current!.parentElement!;
      const box = scene.getBoundingClientRect();
      const scale = 600 / box.width;
      const targets = scene.querySelectorAll(
        active === "Header"
          ? `.${styles.mcp}, .${styles.headerAction}`
          : active === "Action bar"
            ? `.${styles.actions} span:not(.${styles.actionDivider})`
            : active === "Footer"
              ? `.${styles.footer} > span`
              : ":not(*)",
      );
      setRoutes(
        Array.from(root.current!.querySelectorAll<HTMLLIElement>("li")).flatMap(
          (note, index) => {
            if (
              !targets[index] ||
              (selection && (index < selection.start || index >= selection.end))
            )
              return [];
            const from = note.getBoundingClientRect();
            const to = targets[index].getBoundingClientRect();
            const sx = (from.left + from.width / 2 - box.left) * scale;
            const sy =
              (active === "Footer" ? from.top - 8 : from.bottom + 8) * scale -
              box.top * scale;
            const tx = (to.left + to.width / 2 - box.left) * scale;
            const ty =
              (active === "Footer" ? to.bottom + 5 : to.top - 5) * scale -
              box.top * scale;
            const mid = (sy + ty) / 2;
            return [`M ${sx} ${sy} C ${sx} ${mid}, ${tx} ${mid}, ${tx} ${ty}`];
          },
        ),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root.current.parentElement!);
    return () => observer.disconnect();
  }, [active, ready, selection]);

  return (
    <div
      ref={root}
      className={`${styles.annotations} ${handwriting.className}`}
      data-notes={active}
      data-ready={ready}
    >
      {groups && (
        <div className={styles.noteGroups} aria-label={`${active} icon groups`}>
          {groups.map(({ label }, index) => (
            <button
              key={label}
              type="button"
              aria-pressed={group === index}
              onClick={() => setGroup(index)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <svg className={styles.arrows} viewBox="0 0 600 660" aria-hidden="true">
        <defs>
          <marker
            id="panel-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path
              d="M 1 1 L 8 5 L 1 9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </marker>
        </defs>
        {routes.map((route, index) => (
          <path key={index} d={route} markerEnd="url(#panel-arrow)" />
        ))}
      </svg>
      <ul
        style={{
          gridTemplateColumns: `repeat(${selection ? selection.end - selection.start : notes.length}, minmax(0, 1fr))`,
        }}
      >
        {notes.map(({ icon: Icon, text }, index) => (
          <li
            key={text}
            data-in-group={
              !selection || (index >= selection.start && index < selection.end)
            }
          >
            <Icon size={18} aria-hidden="true" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PanelReplica({ active }: { active: string }) {
  const replica = useRef<HTMLDivElement>(null);
  const [settled, setSettled] = useState<string | null>(null);

  useLayoutEffect(() => {
    const element = replica.current!;
    let frame = 0;
    let stableFrames = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const check = () => {
      const moving = element
        .getAnimations()
        .some((animation) => animation.playState === "running");
      stableFrames = moving ? 0 : stableFrames + 1;
      if (moving) setSettled(null);
      if (!moving && (reduced.matches || stableFrames >= 2)) {
        setSettled(active);
      } else {
        frame = requestAnimationFrame(check);
      }
    };
    const restart = () => {
      cancelAnimationFrame(frame);
      stableFrames = 0;
      setSettled(null);
      check();
    };
    restart();
    // Entrance and breakpoint changes can start motion without changing the stage.
    const observer = new MutationObserver(restart);
    const track = element.closest(`.${styles.track}`);
    if (track)
      observer.observe(track, {
        attributes: true,
        attributeFilter: ["data-visible"],
      });
    window.addEventListener("resize", restart);
    reduced.addEventListener("change", restart);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", restart);
      reduced.removeEventListener("change", restart);
    };
  }, [active]);

  const tab = active === "Layers" || active === "Changes" ? active : "Design";
  return (
    <figure className={styles.figure} data-stage={active}>
      <div className={styles.scene}>
        <div
          ref={replica}
          role="img"
          aria-label={`Illustrative Design Mode side panel. ${tab} tab selected. Controls are not interactive.`}
          className={styles.replica}
        >
          <div aria-hidden="true">
            <div className={styles.header}>
              <span className={styles.domain}>designmode.app</span>
              <span className={styles.mcp}>
                <i /> MCP <ChevronRight size={10} />
              </span>
              {[Moon, HeartHandshake, HelpCircle, Settings, ExternalLink].map(
                (Icon, index) => (
                  <span className={styles.headerAction} key={index}>
                    <Icon size={15} />
                  </span>
                ),
              )}
            </div>
            <div className={styles.actions}>
              {[Crosshair, ArrowUp, ArrowDown].map((Icon, index) => (
                <span key={index}>
                  <Icon size={14} />
                </span>
              ))}
              <i />
              {[
                Copy,
                Trash,
                MessageSquare,
                SquareDashedMousePointer,
                Camera,
              ].map((Icon, index) => (
                <span key={index}>
                  <Icon size={14} />
                </span>
              ))}
              <span className={styles.actionDivider} />
              <span>
                <SwatchBook size={14} />
              </span>
              <i />
              {[Undo, Redo].map((Icon, index) => (
                <span key={index}>
                  <Icon size={14} />
                </span>
              ))}
            </div>
            <div className={styles.tabs}>
              <span
                className={tab === "Layers" ? styles.selectedTab : undefined}
              >
                <Layers size={11} /> Layers
              </span>
              <span
                className={tab === "Design" ? styles.selectedTab : undefined}
              >
                <SlidersHorizontal size={11} /> Design
              </span>
              <span
                className={tab === "Changes" ? styles.selectedTab : undefined}
              >
                <Sparkles size={11} /> Changes
              </span>
            </div>
            {tab === "Layers" ? (
              <div className={styles.sampleBody}>
                <div className={styles.sampleHeading}>
                  Page layers <span>Sample page</span>
                </div>
                {[
                  "body",
                  "  main",
                  "    section.hero",
                  "      h1 · Make it yours",
                  "      p · A better starting point",
                  "      div.actions",
                  "        a.primary",
                  "    section.features",
                ].map((label, index) => (
                  <div
                    key={label}
                    className={
                      index === 3 ? styles.layerSelected : styles.layer
                    }
                  >
                    <code>{label}</code>
                    <Eye size={12} />
                  </div>
                ))}
              </div>
            ) : tab === "Changes" ? (
              <div className={styles.sampleBody}>
                <div className={styles.sampleHeading}>
                  3 changes <span>Sample session</span>
                </div>
                <div className={styles.change}>
                  <strong>h1 · Typography</strong>
                  <code>
                    font-size <del>48px</del> → 64px
                  </code>
                  <small>Style change</small>
                </div>
                <div className={styles.change}>
                  <strong>a.primary · Fill</strong>
                  <code>
                    background <del>#222</del> → #0275DE
                  </code>
                  <small>Style change</small>
                </div>
                <div className={styles.change}>
                  <strong>section.hero · Comment</strong>
                  <p>Give the headline more breathing room.</p>
                  <small>Comment</small>
                </div>
              </div>
            ) : (
              <>
                <div className={styles.selection}>
                  <span className={styles.selected}>
                    <Crosshair size={8} /> Selected
                  </span>
                  <code>&lt;h1&gt;</code>
                  <span className={styles.css}>
                    <Code size={11} /> CSS
                  </span>
                </div>
                <div className={styles.states}>
                  {["Hover", "Focus", "Focus vis.", "Active"].map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
                <div className={styles.sections}>
                  {sections.map(({ title, icon: Icon, actions }) => (
                    <div key={title} className={styles.section}>
                      <Icon size={14} />
                      <strong>{title}</strong>
                      {actions.map((Action, index) => (
                        <Action key={index} size={11} />
                      ))}
                      <ChevronRight size={10} />
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className={styles.footer}>
              <span>
                <Clipboard size={13} /> Copy as Prompt
              </span>
              <span>
                <Send size={13} /> Send to your AI agent
              </span>
            </div>
          </div>
        </div>
        <Annotations key={active} active={active} ready={settled === active} />
      </div>
    </figure>
  );
}

export function PanelAnatomy() {
  const [active, setActive] = useState("Sidepanel");
  const track = useRef<HTMLDivElement>(null);
  const sticky = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const update = () => {
      if (!track.current || !sticky.current) return;
      const inset = Number.parseFloat(
        getComputedStyle(sticky.current).getPropertyValue("--panel-sticky-top"),
      );
      const enabled =
        (!media.matches || !reduced.matches) &&
        sticky.current.offsetHeight + inset <= window.innerHeight;
      track.current.dataset.sticky = String(enabled);
      if (!enabled) return;
      const distance = track.current.offsetHeight - sticky.current.offsetHeight;
      const progress = inset - track.current.getBoundingClientRect().top;
      const index = Math.max(
        0,
        Math.min(
          items.length - 1,
          Math.round((progress / distance) * (items.length - 1)),
        ),
      );
      setActive(items[index].title);
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const entrance = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && track.current) {
          track.current.dataset.visible = "true";
          entrance.disconnect();
        }
      },
      { threshold: 0.05 },
    );
    if (track.current) entrance.observe(track.current);
    const observer = new ResizeObserver(onScroll);
    if (sticky.current) observer.observe(sticky.current);
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      observer.disconnect();
      entrance.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const select = (title: string) => {
    if (!title) return;
    setActive(title);
    if (track.current?.dataset.sticky !== "true" || !sticky.current) return;
    const distance = track.current.offsetHeight - sticky.current.offsetHeight;
    const inset = Number.parseFloat(
      getComputedStyle(sticky.current).getPropertyValue("--panel-sticky-top"),
    );
    const top =
      window.scrollY + track.current.getBoundingClientRect().top - inset;
    // Instant navigation keeps scroll-derived selection and keyboard focus in sync.
    window.scrollTo({
      top:
        top +
        (distance * items.findIndex((item) => item.title === title)) /
          (items.length - 1),
      behavior: "instant",
    });
  };

  return (
    <section
      id="panel-anatomy"
      aria-labelledby="panel-anatomy-title"
      className="py-32"
    >
      <div ref={track} className={styles.track}>
        <div ref={sticky} className={`container ${styles.sticky}`}>
          <h2
            id="panel-anatomy-title"
            className="text-center text-3xl tracking-tight text-balance sm:text-4xl md:text-5xl lg:text-6xl"
          >
            Every design control, in one side panel
          </h2>
          <div className={styles.mobileIntro}>
            <h3>{active}</h3>
            <p>
              {items.find((item) => item.title === active)!.lines.join(" ")}
            </p>
          </div>
          <div className={styles.walkthrough}>
            <nav className={styles.dots} aria-label="Panel anatomy stages">
              {items.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  aria-label={item.title}
                  aria-current={active === item.title ? "step" : undefined}
                  onClick={() => select(item.title)}
                >
                  <span />
                </button>
              ))}
            </nav>
            <Accordion
              type="single"
              value={active}
              onValueChange={select}
              className={styles.accordion}
            >
              {items.map((item, index) => (
                <AccordionItem key={item.title} value={item.title}>
                  <AccordionTrigger className="focus-visible:ring-ring gap-4 rounded-sm py-3 text-base focus-visible:ring-2 focus-visible:outline-none motion-reduce:transition-none motion-reduce:[&>svg]:transition-none">
                    <span className="flex items-center gap-4">
                      <span
                        aria-hidden="true"
                        className="text-muted-foreground text-base tabular-nums"
                      >
                        0{index + 1}
                      </span>
                      {item.title}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground min-h-18 pl-8 text-base leading-relaxed">
                    {item.lines.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
            <PanelReplica active={active} />
          </div>
        </div>
      </div>
    </section>
  );
}
