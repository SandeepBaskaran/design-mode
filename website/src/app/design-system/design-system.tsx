"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";

import { Check, Copy, RotateCcw } from "lucide-react";

import type { ComponentFile, PageInfo } from "./analysis";
import { PagesView } from "./pages-view";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";


type TokenGroup = { title: string; tokens: string[] };

const COLOR_GROUPS: TokenGroup[] = [
  { title: "Surface", tokens: ["--background", "--foreground", "--card", "--card-foreground", "--popover", "--popover-foreground"] },
  { title: "Brand", tokens: ["--primary", "--primary-foreground", "--ink", "--ink-foreground", "--ring"] },
  { title: "Neutral", tokens: ["--secondary", "--secondary-foreground", "--muted", "--muted-foreground", "--accent", "--accent-foreground"] },
  { title: "Lines & status", tokens: ["--border", "--input", "--destructive", "--destructive-foreground"] },
];
const SHADOWS = ["--shadow-2xs", "--shadow-xs", "--shadow-sm", "--shadow", "--shadow-md", "--shadow-lg", "--shadow-xl", "--shadow-2xl"];
const EDITABLE = [...COLOR_GROUPS.flatMap((g) => g.tokens), "--radius", "--display-weight", "--text-weight"];
const TYPE_SCALE = [
  { label: "Display / 6xl", className: "font-display text-6xl", spec: "4rem · 1" },
  { label: "Heading / 4xl", className: "font-display text-4xl", spec: "2.5rem · 1.2" },
  { label: "Heading / 3xl", className: "font-display text-3xl", spec: "2rem · 1.2" },
  { label: "Heading / 2xl", className: "font-display text-2xl", spec: "1.5rem" },
  { label: "Body", className: "text-base", spec: "1rem · 1.5" },
  { label: "Small", className: "text-sm text-muted-foreground", spec: "0.875rem" },
];
const STORAGE_KEY = "dm-design-system-draft";
const TABS = ["Style guide", "Components", "Pages"] as const;

function toHex6(value: string) {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}` : null;
}

function readToken(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function DesignSystem({
  gallery,
  pages,
  components,
}: {
  gallery: ReactNode;
  pages: PageInfo[];
  components: ComponentFile[];
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Style guide");
  const [base, setBase] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setBase(Object.fromEntries(EDITABLE.map((t) => [t, readToken(t)])));
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
      if (saved && typeof saved === "object") setDraft(saved);
    } catch {}
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    for (const [name, value] of Object.entries(draft)) root.style.setProperty(name, value);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {}
    return () => {
      for (const name of Object.keys(draft)) root.style.removeProperty(name);
    };
  }, [draft]);

  const changed = useMemo(
    () => Object.entries(draft).filter(([name, value]) => value && value !== base[name]),
    [draft, base],
  );
  const exportCss = changed.length
    ? `:root {\n${changed.map(([n, v]) => `  ${n}: ${v};`).join("\n")}\n}\n`
    : "";

  const setToken = (name: string, value: string) => setDraft((d) => ({ ...d, [name]: value }));
  const valueOf = (name: string) => draft[name] ?? base[name] ?? "";

  const [jumpTo, setJumpTo] = useState<string | null>(null);
  useEffect(() => {
    if (!jumpTo || tab !== "Components") return;
    const target = document.getElementById(`c-${jumpTo.replace("/", "-")}`);
    target?.scrollIntoView({ block: "start" });
    // Previews above the target load media and shift layout after the first scroll.
    setTimeout(() => target?.scrollIntoView({ block: "start" }), 400);
    setJumpTo(null);
  }, [jumpTo, tab]);

  function openComponent(id: string) {
    setTab("Components");
    setJumpTo(id);
  }

  async function copyExport() {
    try {
      await navigator.clipboard.writeText(exportCss);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  }

  return (
    <div className="bg-background min-h-screen pb-24">
      <header className="border-b">
        <div className="container flex flex-col gap-6 pt-12 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-muted-foreground text-sm">Internal · not indexed</p>
            <h1 className="font-display mt-1 text-4xl">Design system</h1>
            <p className="text-muted-foreground mt-2 max-w-xl">
              Tokens from <code className="text-foreground">src/styles/globals.css</code>. Edit a
              value to preview it across this page, then copy the changes so they can be applied
              site-wide.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm" aria-live="polite">
              {changed.length ? `${changed.length} unsaved change${changed.length === 1 ? "" : "s"}` : "No changes"}
            </span>
            <Button variant="outline" size="sm" onClick={() => setDraft({})} disabled={!changed.length}>
              <RotateCcw /> Reset
            </Button>
            <Button size="sm" onClick={copyExport} disabled={!changed.length}>
              {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy changes"}
            </Button>
          </div>
        </div>
        <div className="container">
          <div role="tablist" aria-label="Design system sections" className="flex gap-1">
            {TABS.map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  "-mb-px border-b-2 px-4 py-3 text-sm font-semibold transition-colors",
                  tab === t ? "border-primary text-foreground" : "text-muted-foreground hover:text-foreground border-transparent",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className={tab === "Pages" ? "mt-10 px-4 md:px-8" : "container mt-10"} role="tabpanel" aria-label={tab}>
        {tab === "Style guide" && <StyleGuide valueOf={valueOf} setToken={setToken} draft={draft} base={base} />}
        {tab === "Components" && gallery}
        {tab === "Pages" && <PagesView pages={pages} components={components} openComponent={openComponent} />}
        {exportCss && (
          <section className="mt-16">
            <h2 className="font-display text-2xl">Pending changes</h2>
            <pre className="bg-ink text-ink-foreground mt-4 overflow-x-auto rounded-xl p-5 text-sm">{exportCss}</pre>
          </section>
        )}
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-14">
      <h2 className="font-display mb-5 text-2xl">{title}</h2>
      {children}
    </section>
  );
}

function StyleGuide({
  valueOf,
  setToken,
  draft,
  base,
}: {
  valueOf: (n: string) => string;
  setToken: (n: string, v: string) => void;
  draft: Record<string, string>;
  base: Record<string, string>;
}) {
  const radius = parseFloat(valueOf("--radius")) || 8;
  return (
    <>
      <Section title="Color">
        <div className="grid gap-8 md:grid-cols-2">
          {COLOR_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-muted-foreground mb-3 text-sm font-semibold">{group.title}</h3>
              <div className="bg-card overflow-hidden rounded-xl border">
                {group.tokens.map((name) => {
                  const value = valueOf(name);
                  const hex = toHex6(value);
                  const dirty = draft[name] !== undefined && draft[name] !== base[name];
                  return (
                    <div key={name} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
                      <label className="relative size-9 shrink-0 overflow-hidden rounded-md border" style={{ background: `var(${name})` }}>
                        {hex && (
                          <input
                            type="color"
                            value={hex}
                            onChange={(e) => setToken(name, e.target.value)}
                            aria-label={`Pick ${name}`}
                            className="absolute inset-0 cursor-pointer opacity-0"
                          />
                        )}
                      </label>
                      <code className="flex-1 text-sm">
                        {name}
                        {dirty && <span className="text-primary ml-2 text-xs">edited</span>}
                      </code>
                      <input
                        value={value}
                        onChange={(e) => setToken(name, e.target.value)}
                        aria-label={`${name} value`}
                        className="bg-background w-40 rounded-md border px-2 py-1 font-mono text-xs"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <div className="mb-6 flex flex-wrap gap-6">
          {(["--display-weight", "--text-weight"] as const).map((name) => (
            <label key={name} className="flex items-center gap-3 text-sm">
              <code>{name}</code>
              <select
                value={valueOf(name)}
                onChange={(e) => setToken(name, e.target.value)}
                className="bg-card rounded-md border px-2 py-1"
              >
                {[300, 400, 500, 600, 700, 800].map((w) => (
                  <option key={w} value={String(w)}>{w}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="bg-card divide-y rounded-xl border">
          {TYPE_SCALE.map((t) => (
            <div key={t.label} className="flex flex-col gap-2 px-5 py-5 md:flex-row md:items-baseline md:gap-8">
              <div className="text-muted-foreground w-40 shrink-0 text-xs">
                {t.label}
                <div>{t.spec}</div>
              </div>
              <p className={t.className}>Edit any site, ship real code.</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Radius">
        <label className="mb-5 flex items-center gap-4 text-sm">
          <code>--radius</code>
          <input
            type="range"
            min={0}
            max={24}
            value={radius}
            onChange={(e) => setToken("--radius", `${e.target.value}px`)}
            className="w-56"
          />
          <span className="font-mono text-xs">{radius}px</span>
        </label>
        <div className="flex flex-wrap gap-5">
          {["rounded-sm", "rounded-md", "rounded-lg", "rounded-xl", "rounded-2xl", "rounded-3xl"].map((r) => (
            <div key={r} className="text-center text-xs">
              <div className={cn("bg-primary/15 border-primary/40 size-20 border", r)} />
              <div className="text-muted-foreground mt-2">{r}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Shadow">
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {SHADOWS.map((s) => (
            <div key={s} className="bg-card flex h-24 items-end rounded-xl p-3" style={{ boxShadow: `var(${s})` }}>
              <code className="text-muted-foreground text-xs">{s}</code>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
