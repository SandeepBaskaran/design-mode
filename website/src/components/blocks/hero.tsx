import Image from "next/image";
import Link from "next/link";

import { Heart, MousePointer2, Palette, Ruler, Wand2 } from "lucide-react";

import { ProductHunt } from "@/components/blocks/product-hunt";
import { VisualEditorPill } from "@/components/blocks/visual-editor-pill";
import { DashedLine } from "@/components/dashed-line";
import { AddToChromeCta } from "@/components/site/add-to-chrome-cta";
import { Button } from "@/components/ui/button";

const features = [
  {
    title: "Inspect anything",
    description: "Click any element on any live site and edit its CSS visually.",
    icon: MousePointer2,
  },
  {
    title: "Layout, type, colour",
    description: "A full design surface in the side panel — not a devtools fork.",
    icon: Palette,
  },
  {
    title: "Measure & resize",
    description: "Drag 8 handles to resize, and see pixel spacing between elements live.",
    icon: Ruler,
  },
  {
    title: "Ship to your agent",
    description: "Send the diff to Claude Code, Cursor, or any MCP-aware tool.",
    icon: Wand2,
  },
  {
    title: "Free, forever",
    description: "Open source under MIT. No accounts, no telemetry by default.",
    icon: Heart,
  },
];

export const Hero = () => {
  return (
    <section className="pt-28 pb-12 lg:pt-44 lg:pb-16">
      {/* Hero — vertical stack, centred */}
      <div className="container max-w-4xl text-center">
        <div className="mb-6 flex justify-center">
          <ProductHunt />
        </div>

        <div className="mb-5 flex justify-center">
          <VisualEditorPill />
        </div>

        <h1 className="macro text-foreground text-[clamp(2.5rem,7vw,5rem)]">
          Design directly in your browser.
          <br className="hidden md:block" /> Your agent writes the code.
        </h1>

        <p className="text-muted-foreground mx-auto mt-5 max-w-[848px] text-lg">
          Design Mode is a free, open-source Chrome extension that turns any
          live website into a visual design surface — one design tool for
          every maker, from designers and developers to QA testers, PMs,
          indie hackers, and vibe coders.
        </p>
        <p className="text-muted-foreground mx-auto mt-3 max-w-[848px] text-sm md:text-base">
          Edit layout, typography, colour, spacing, copy and DOM with real
          controls, then ship the diff to{" "}
          <span className="text-foreground">Claude Code</span>,{" "}
          <span className="text-foreground">Cursor</span>,{" "}
          <span className="text-foreground">Claude Desktop</span>,{" "}
          <span className="text-foreground">Windsurf</span>,{" "}
          <span className="text-foreground">Cline</span>, or any
          MCP-compatible AI coding agent.
        </p>

        {/* Secondary on the LEFT (Try by yourself → /demo), primary on the RIGHT (Add to Chrome) */}
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <AddToChromeCta size="lg" />
          <Button variant="outline" size="lg" asChild>
            <Link href="/demo">Try by yourself</Link>
          </Button>
        </div>
      </div>
    </section>
  );
};

export const HeroShowcase = () => {
  return (
    <section className="pb-12 lg:pb-16">
      <div className="container flex flex-col gap-10 py-12 lg:flex-row lg:items-center lg:gap-16">
        {/* Left — cover image */}
        <div className="flex-1">
          <div className="relative mx-auto aspect-square w-full max-w-[400px]">
            <Image
              src="/cover.png"
              alt="The Design Mode side panel on a live website"
              fill
              sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 90vw"
              className="rounded-2xl object-cover object-top shadow-lg"
              priority
            />
          </div>
        </div>

        {/* Right — feature bullets */}
        <div className="relative flex flex-1 flex-col justify-center space-y-5 lg:max-w-md lg:pl-10">
          <DashedLine
            orientation="vertical"
            className="absolute top-0 left-0 max-lg:hidden"
          />
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="flex gap-2.5 lg:gap-5">
                <Icon className="text-foreground mt-1 size-4 shrink-0 lg:size-5" />
                <div>
                  <h2 className="font-text text-foreground font-semibold">
                    {feature.title}
                  </h2>
                  <p className="text-muted-foreground max-w-76 text-sm">
                    {feature.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
