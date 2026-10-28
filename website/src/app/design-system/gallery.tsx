import type { ReactNode } from "react";

import type { ComponentFile } from "./analysis";
import { UiPrimitives } from "./ui-primitives";

import { Background } from "@/components/background";
import { WhyThisExists, TextSection } from "@/components/blocks/about";
import { AboutHero } from "@/components/blocks/about-hero";
import { AgentWorkflow } from "@/components/blocks/agent-workflow";
import { BrowserHandoff } from "@/components/blocks/browser-handoff";
import { ClosingCta } from "@/components/blocks/closing-cta";
import { ContactChannels, ContactHero, ContactReports } from "@/components/blocks/contact";
import { FAQ } from "@/components/blocks/faq";
import { Features } from "@/components/blocks/features";
import { Footer } from "@/components/blocks/footer";
import { Hero, HeroShowcase } from "@/components/blocks/hero";
import { AgentIcons, HeroHeadline } from "@/components/blocks/hero-headline";
import { Logos } from "@/components/blocks/logos";
import { ModesComparison } from "@/components/blocks/modes-comparison";
import { Navbar } from "@/components/blocks/navbar";
import { PanelAnatomy } from "@/components/blocks/panel-anatomy";
import { PersonaBlock } from "@/components/blocks/persona-block";
import { ProductHunt } from "@/components/blocks/product-hunt";
import { Testimonials } from "@/components/blocks/testimonials";
import { VisualEditorPill } from "@/components/blocks/visual-editor-pill";
import { DashedLine } from "@/components/dashed-line";
import { PageHero } from "@/components/layout/page-hero";
import { PageSection } from "@/components/layout/page-section";
import { AddToChromeCta, OtherStoreLink } from "@/components/site/add-to-chrome-cta";
import { BackToTop } from "@/components/site/back-to-top";
import { BrowserBanner } from "@/components/site/browser-banner";
import { CopyPrompt } from "@/components/site/copy-prompt";
import { FaqAnswer } from "@/components/site/faq-answer";
import { RelatedLinks } from "@/components/site/related-links";
import { faqGroups } from "@/content/product-facts";


const PREVIEWS: Record<string, { node: ReactNode; frame?: "full" }> = {
  "ui/accordion": { node: <UiPrimitives only="accordion" /> },
  "ui/button": { node: <UiPrimitives only="button" /> },
  "ui/card": { node: <UiPrimitives only="card" /> },
  "ui/carousel": { node: <UiPrimitives only="carousel" /> },
  "ui/collapsible": { node: <UiPrimitives only="collapsible" /> },
  "ui/navigation-menu": { node: <UiPrimitives only="navigation-menu" /> },
  "blocks/about": {
    frame: "full",
    node: (
      <>
        <WhyThisExists />
        <div className="container py-10">
          <TextSection title="TextSection" paragraphs={["A titled block of paragraphs used on the About page."]} />
        </div>
      </>
    ),
  },
  "blocks/about-hero": { frame: "full", node: <AboutHero /> },
  "blocks/agent-workflow": { frame: "full", node: <AgentWorkflow /> },
  "blocks/browser-handoff": { frame: "full", node: <BrowserHandoff /> },
  "blocks/closing-cta": { frame: "full", node: <ClosingCta /> },
  "blocks/contact": {
    frame: "full",
    node: (
      <>
        <ContactHero />
        <ContactChannels />
        <ContactReports />
      </>
    ),
  },
  "blocks/faq": { frame: "full", node: <FAQ /> },
  "blocks/features": { frame: "full", node: <Features /> },
  "blocks/footer": { frame: "full", node: <Footer /> },
  "blocks/hero": {
    frame: "full",
    node: (
      <>
        <Hero />
        <HeroShowcase />
      </>
    ),
  },
  "blocks/hero-headline": {
    node: (
      <div className="space-y-6">
        <HeroHeadline />
        <AgentIcons size={28} />
      </div>
    ),
  },
  "blocks/logos": { frame: "full", node: <Logos /> },
  "blocks/modes-comparison": { frame: "full", node: <ModesComparison /> },
  "blocks/navbar": { frame: "full", node: <Navbar /> },
  "blocks/panel-anatomy": { frame: "full", node: <PanelAnatomy /> },
  "blocks/persona-block": { frame: "full", node: <PersonaBlock /> },
  "blocks/product-hunt": { node: <ProductHunt /> },
  "blocks/testimonials": { frame: "full", node: <Testimonials /> },
  "blocks/visual-editor-pill": { node: <VisualEditorPill /> },
  "layout/page-hero": {
    frame: "full",
    node: (
      <>
        <PageHero title="PageHero" description="Default: width 5xl, description max-w-3xl." />
        <PageHero
          title="Detail page title"
          description="width 4xl with an eyebrow, as on blog and use-case pages."
          eyebrow="Eyebrow"
          width="4xl"
        />
      </>
    ),
  },
  "layout/page-section": {
    frame: "full",
    node: (
      <>
        <PageSection tone="hero">
          <div className="container max-w-5xl">tone=&quot;hero&quot; — Background slab, py-12 lg:py-16</div>
        </PageSection>
        <PageSection tone="body">
          <div className="container mt-12 max-w-5xl">tone=&quot;body&quot; — py-16 lg:py-20, DashedLine first</div>
        </PageSection>
        <PageSection tone="bottom">
          <div className="container mt-12 max-w-5xl">tone=&quot;bottom&quot; — bottom slab, py-20 lg:py-28</div>
        </PageSection>
      </>
    ),
  },
  background: {
    frame: "full",
    node: (
      <Background>
        <div className="container py-16 text-center">Hero content sits on the top gradient slab.</div>
      </Background>
    ),
  },
  "dashed-line": {
    node: (
      <div className="flex h-24 items-center gap-10">
        <DashedLine className="w-64" />
        <DashedLine orientation="vertical" className="h-20" />
      </div>
    ),
  },
  "site/add-to-chrome-cta": {
    node: (
      <div className="flex flex-wrap items-center gap-4">
        <AddToChromeCta size="sm" />
        <AddToChromeCta />
        <AddToChromeCta size="lg" />
        <OtherStoreLink />
      </div>
    ),
  },
  "site/back-to-top": { node: <div className="text-muted-foreground text-sm">Fixed bottom-right button; appears after scrolling (visible on this page).<BackToTop /></div> },
  "site/browser-banner": { node: <BrowserBanner /> },
  "site/copy-prompt": { node: <CopyPrompt text="Use Design Mode to apply the recorded changes." /> },
  "site/faq-answer": { node: <FaqAnswer qa={faqGroups[0].items[0]} /> },
  "site/related-links": {
    node: (
      <RelatedLinks
        links={[
          { href: "/docs", title: "Docs", description: "Set up and use Design Mode." },
          { href: "/mcp", title: "MCP", description: "Connect a coding agent." },
        ]}
      />
    ),
  },
};

const NON_VISUAL: Record<string, string> = {
  "site/analytics": "Loads analytics scripts — renders nothing visible.",
  "site/json-ld": "Structured-data <script> tags for search engines — renders nothing visible.",
  "site/link-tracker": "Tracks outbound link clicks — renders nothing visible.",
};

const GROUPS: { title: string; match: (id: string) => boolean }[] = [
  { title: "UI primitives", match: (id) => id.startsWith("ui/") },
  { title: "Layout", match: (id) => id.startsWith("layout/") || id === "background" || id === "dashed-line" },
  { title: "Section blocks", match: (id) => id.startsWith("blocks/") },
  { title: "Site components", match: (id) => id.startsWith("site/") },
];

export function Gallery({ components }: { components: ComponentFile[] }) {
  return (
    <div className="space-y-16">
      {GROUPS.map((group) => (
        <section key={group.title}>
          <h2 className="font-display mb-6 text-2xl">{group.title}</h2>
          <div className="space-y-10">
            {components.filter((c) => group.match(c.id)).map((c) => {
              const preview = PREVIEWS[c.id];
              return (
                <article key={c.id} id={`c-${c.id.replace("/", "-")}`} className="scroll-mt-24">
                  <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="font-display text-lg">{c.exports.join(", ") || c.id}</h3>
                    <code className="text-muted-foreground text-xs">{c.file}</code>
                    {c.client && <span className="bg-secondary rounded px-1.5 py-0.5 text-[10px] font-semibold">client</span>}
                    <span className="text-muted-foreground text-xs">
                      {c.usedBy.length ? `Used by ${c.usedBy.join(", ")}` : "Not used anywhere"}
                    </span>
                  </div>
                  {preview ? (
                    <div className={preview.frame === "full" ? "bg-background overflow-hidden rounded-xl border" : "bg-card rounded-xl border p-6"} style={{ transform: "translateZ(0)" }}>
                      {preview.node}
                    </div>
                  ) : (
                    <p className="bg-card text-muted-foreground rounded-xl border p-6 text-sm">
                      {NON_VISUAL[c.id] ?? "No preview yet."}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
