"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { ComponentFile, PageInfo } from "./analysis";

import { cn } from "@/lib/utils";

const VIEWPORTS = {
  Mobile: { width: 390, height: 844 },
  Tablet: { width: 768, height: 1024 },
  Desktop: { width: 1440, height: 900 },
} as const;
type Viewport = keyof typeof VIEWPORTS;
type Mode = Viewport | "Mobile + Desktop";

const OVERLAY = "data-ds-overlay";
const BLUE = "#0275de";
const RED = "#e5484d";
const GREEN = "#2f9e44";

type Counts = {
  components: Record<string, { total: number; visible: number }>;
  inline: Record<string, { total: number; visible: number }>;
  primitives: Record<string, { total: number; visible: number }>;
};

function patternToRegex(route: string) {
  return new RegExp("^" + route.replace(/\[[^\]]+\]/g, "[^/]+") + "/?$");
}

function namesOf(el: Element) {
  return (el.getAttribute("data-ds") ?? "").split(" ").filter(Boolean);
}

function isVisible(el: Element) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function bump(map: Counts["components"], key: string, visible: boolean) {
  const entry = (map[key] ??= { total: 0, visible: 0 });
  entry.total += 1;
  if (visible) entry.visible += 1;
}

// Draws outlines in an overlay layer inside the preview iframe, so the inspected
// page's own elements and layout are never modified.
function paintFrame(
  doc: Document,
  show: { components: boolean; inline: boolean; primitives: boolean },
  onPick: (name: string) => void,
): Counts {
  doc.querySelectorAll(`[${OVERLAY}]`).forEach((el) => el.remove());
  const counts: Counts = { components: {}, inline: {}, primitives: {} };
  const layer = doc.createElement("div");
  layer.setAttribute(OVERLAY, "");
  layer.style.cssText =
    "position:absolute;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none";
  doc.body.appendChild(layer);
  const seen: Record<string, number> = {};
  const scrollX = doc.defaultView?.scrollX ?? 0;
  const scrollY = doc.defaultView?.scrollY ?? 0;

  const box = (
    el: Element,
    color: string,
    dashed: boolean,
    label: string,
    onClick?: () => void,
  ) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const frame = doc.createElement("div");
    frame.setAttribute(OVERLAY, "");
    frame.style.cssText = `position:absolute;left:${r.left + scrollX}px;top:${r.top + scrollY}px;width:${r.width}px;height:${r.height}px;outline:2px ${dashed ? "dashed" : "solid"} ${color};outline-offset:-2px;pointer-events:none`;
    const tag = doc.createElement(onClick ? "button" : "span");
    tag.setAttribute(OVERLAY, "");
    tag.textContent = label;
    tag.style.cssText = `position:absolute;left:0;top:0;font:600 11px/1.4 system-ui,sans-serif;color:#fff;background:${color};padding:1px 6px;border:0;border-radius:0 0 4px 0;pointer-events:auto;cursor:${onClick ? "pointer" : "default"};white-space:nowrap`;
    if (onClick)
      tag.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      });
    frame.appendChild(tag);
    layer.appendChild(frame);
  };

  doc.querySelectorAll("[data-ds]").forEach((el) => {
    if (el.closest(`[${OVERLAY}]`)) return;
    const visible = isVisible(el);
    const names = namesOf(el);
    names.forEach((n) => bump(counts.components, n, visible));
    if (!show.components) return;
    const label = names
      .map((n) => {
        seen[n] = (seen[n] ?? 0) + 1;
        return `${n} #${seen[n]}`;
      })
      .join(" › ");
    box(el, BLUE, false, label, () => onPick(names[0]));
  });

  doc.querySelectorAll("[data-ds-inline]").forEach((el) => {
    const label = el.getAttribute("data-ds-inline")!;
    const visible = isVisible(el);
    bump(counts.inline, label, visible);
    if (show.inline) box(el, RED, true, `Not a component: ${label}`);
  });

  doc.querySelectorAll("[data-slot]").forEach((el) => {
    const slot = el.getAttribute("data-slot")!;
    bump(counts.primitives, slot, isVisible(el));
    if (show.primitives) box(el, GREEN, true, `ui/${slot}`);
  });
  return counts;
}

function Frame({
  url,
  viewport,
  frameRef,
  onLoad,
  narrow,
}: {
  url: string;
  viewport: Viewport;
  narrow?: boolean;
  frameRef?: React.Ref<HTMLIFrameElement>;
  onLoad?: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const { width: vw, height: vh } = VIEWPORTS[viewport];
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = width ? Math.min(1, width / vw) : 0;
  return (
    <div ref={box} className={narrow ? "w-[300px] shrink-0" : "min-w-0 flex-1"}>
      <div className="text-muted-foreground mb-2 text-xs">
        {viewport} · {vw}×{vh}
        {scale > 0 && scale < 1
          ? ` · shown at ${Math.round(scale * 100)}%`
          : ""}
      </div>
      <div
        className="bg-card overflow-hidden rounded-xl border shadow-sm"
        style={{ height: vh * scale }}
      >
        {scale > 0 && (
          <iframe
            ref={frameRef}
            src={url}
            title={`${url} at ${viewport}`}
            onLoad={onLoad}
            style={{
              width: vw,
              height: vh,
              transform: `scale(${scale})`,
              transformOrigin: "0 0",
              border: 0,
            }}
          />
        )}
      </div>
    </div>
  );
}

export function PagesView({
  pages,
  components,
  openComponent,
}: {
  pages: PageInfo[];
  components: ComponentFile[];
  openComponent: (id: string) => void;
}) {
  const routes = useMemo(() => pages.filter((p) => !p.isLayout), [pages]);
  const layouts = useMemo(() => pages.filter((p) => p.isLayout), [pages]);
  const fileOf = useMemo(
    () =>
      new Map(components.flatMap((c) => c.exports.map((n) => [n, c] as const))),
    [components],
  );
  const [selected, setSelected] = useState(routes[0]?.route ?? "/");
  const [mode, setMode] = useState<Mode>("Mobile + Desktop");
  const [show, setShow] = useState({ components: true, inline: true, primitives: false });
  const [sitemap, setSitemap] = useState<string[]>([]);
  const [counts, setCounts] = useState<Counts[]>([]);
  const frames = useRef<(HTMLIFrameElement | null)[]>([]);

  useEffect(() => {
    fetch("/sitemap.xml")
      .then((r) => r.text())
      .then((xml) =>
        setSitemap(
          [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
            (m) => new URL(m[1]).pathname,
          ),
        ),
      )
      .catch(() => setSitemap([]));
  }, []);

  const page = routes.find((p) => p.route === selected) ?? routes[0];
  const url = useMemo(() => {
    if (!page) return null;
    if (!page.route.includes("[")) return page.route;
    const re = patternToRegex(page.route);
    return sitemap.find((p) => re.test(p)) ?? null;
  }, [page, sitemap]);

  function pick(name: string) {
    const c = fileOf.get(name);
    if (c) openComponent(c.id);
  }

  function paint() {
    setCounts(
      frames.current.map((frame) => {
        const doc = frame?.contentDocument;
        return doc?.body
          ? paintFrame(doc, show, pick)
          : { components: {}, inline: {}, primitives: {} };
      }),
    );
  }

  useEffect(paint, [show, page]); // eslint-disable-line react-hooks/exhaustive-deps

  function reveal(selector: string) {
    for (const frame of frames.current) {
      const doc = frame?.contentDocument;
      const el = [...(doc?.querySelectorAll(selector) ?? [])].find(isVisible);
      el?.scrollIntoView({ block: "start" });
    }
    setTimeout(paint, 50);
  }

  const viewports: Viewport[] =
    mode === "Mobile + Desktop" ? ["Mobile", "Desktop"] : [mode];
  const tally = (kind: keyof Counts, key: string) =>
    viewports
      .map((v, i) => {
        const c = counts[i]?.[kind][key];
        if (!c) return `${v}: 0`;
        return c.visible === c.total
          ? `${v}: ${c.total}`
          : `${v}: ${c.total} (${c.total - c.visible} hidden at this width)`;
      })
      .join(" · ");

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <nav aria-label="Pages" className="lg:w-52 lg:shrink-0">
        <div className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">
          {routes.map((p) => (
            <button
              key={p.file}
              onClick={() => setSelected(p.route)}
              aria-current={p.route === page?.route ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm",
                p.route === page?.route
                  ? "bg-accent text-foreground font-semibold"
                  : "text-muted-foreground hover:bg-secondary",
              )}
            >
              <span className="truncate">{p.route}</span>
              {p.inline.length > 0 && (
                <span
                  className="text-destructive shrink-0 text-xs"
                  title="Parts not made of components"
                >
                  {p.inline.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {page && (
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div
              role="group"
              aria-label="Viewport"
              className="bg-secondary flex rounded-lg p-1"
            >
              {(
                ["Mobile", "Tablet", "Desktop", "Mobile + Desktop"] as Mode[]
              ).map((m) => (
                <button
                  key={m}
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-semibold",
                    mode === m ? "bg-card shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={show.components}
                onChange={(e) =>
                  setShow((s) => ({ ...s, components: e.target.checked }))
                }
              />
              <span className="text-primary font-semibold">Components</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={show.inline}
                onChange={(e) =>
                  setShow((s) => ({ ...s, inline: e.target.checked }))
                }
              />
              <span className="text-destructive font-semibold">
                Not components
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={show.primitives}
                onChange={(e) =>
                  setShow((s) => ({ ...s, primitives: e.target.checked }))
                }
              />
              <span className="font-semibold text-[#2f9e44]">UI primitives</span>
            </label>
            <button
              onClick={paint}
              className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
            >
              Redraw outlines
            </button>
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="text-primary ml-auto text-sm underline-offset-4 hover:underline"
              >
                Open {url}
              </a>
            )}
          </div>

          <div className="flex flex-col gap-6 min-[1800px]:flex-row">
            <div className="flex min-w-0 flex-1 gap-4">
              {url ? (
                viewports.map((v, i) => (
                  <Frame
                    key={`${url}-${v}`}
                    url={url}
                    viewport={v}
                    frameRef={(el) => {
                      frames.current[i] = el;
                    }}
                    onLoad={() => {
                      paint();
                      setTimeout(paint, 800);
                    }}
                    narrow={viewports.length > 1 && v === "Mobile"}
                  />
                ))
              ) : (
                <p className="text-muted-foreground text-sm">
                  No example URL found in the sitemap for {page.route}.
                </p>
              )}
            </div>

            <aside className="min-[1800px]:w-96 min-[1800px]:shrink-0">
              <h3 className="font-display text-lg">{page.route}</h3>
              <code className="text-muted-foreground text-xs">{page.file}</code>
              <p className="text-muted-foreground mt-2 text-xs">
                Source order. Counts are instances found in the preview by their
                markers — nothing is matched by position or heading.
              </p>
              <ol className="mt-4 space-y-1.5">
                {page.outline.map((o) => {
                  if (o.kind === "component") {
                    const c = fileOf.get(o.name);
                    const elsewhere = (c?.routes ?? []).filter(
                      (r) => r !== page.route,
                    );
                    return (
                      <li
                        key={`c${o.line}${o.name}`}
                        className="rounded-md border px-2 py-1.5 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "size-2 shrink-0 rounded-full",
                              o.marked
                                ? "bg-primary"
                                : "bg-muted-foreground/40",
                            )}
                            aria-hidden
                          />
                          <button
                            onClick={() =>
                              o.marked
                                ? reveal(`[data-ds~="${o.name}"]`)
                                : undefined
                            }
                            className="font-semibold hover:underline"
                          >
                            {o.name}
                          </button>
                          <button
                            onClick={() => openComponent(o.id)}
                            className="text-primary ml-auto text-xs hover:underline"
                          >
                            Details
                          </button>
                        </div>
                        <div className="text-muted-foreground mt-0.5 text-xs">
                          {o.marked
                            ? tally("components", o.name)
                            : "No marker (UI primitive or non-visual) — not outlined"}
                        </div>
                        {elsewhere.length > 0 && (
                          <div
                            className="text-muted-foreground mt-0.5 truncate text-xs"
                            title={elsewhere.join(", ")}
                          >
                            Also on {elsewhere.length}: {elsewhere.join(", ")}
                          </div>
                        )}
                      </li>
                    );
                  }
                  return (
                    <li
                      key={`i${o.line}`}
                      className="border-destructive/40 bg-destructive/5 rounded-md border border-dashed px-2 py-1.5 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="bg-destructive size-2 shrink-0 rounded-full"
                          aria-hidden
                        />
                        {o.label ? (
                          <button
                            onClick={() =>
                              reveal(`[data-ds-inline="${o.label}"]`)
                            }
                            className="truncate hover:underline"
                          >
                            {o.label}
                          </button>
                        ) : (
                          <span className="truncate">&lt;{o.tag}&gt;</span>
                        )}
                        <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                          line {o.line}
                        </span>
                      </div>
                      <div className="text-muted-foreground mt-0.5 text-xs">
                        {o.label
                          ? tally("inline", o.label)
                          : "No data-ds-inline label — cannot be located without guessing"}
                      </div>
                    </li>
                  );
                })}
              </ol>
              <p className="text-muted-foreground mt-4 text-xs">
                Every page also gets{" "}
                {layouts
                  .flatMap((l) => l.components.flatMap((c) => c.names))
                  .filter((n, i, a) => a.indexOf(n) === i)
                  .join(", ")}{" "}
                from the layout.
              </p>
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}
