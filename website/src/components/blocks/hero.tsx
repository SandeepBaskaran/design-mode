import Image from "next/image";
import Link from "next/link";

import { Heart, MousePointer2, Palette, Wand2 } from "lucide-react";

import { ProductHunt } from "@/components/blocks/product-hunt";
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

        <h1 className="text-foreground text-3xl tracking-tight md:text-4xl lg:text-5xl">
          Design directly in your browser.
          <br className="hidden md:block" /> Your agent writes the code.
        </h1>

        <p className="text-muted-foreground mx-auto mt-5 max-w-3xl text-lg md:text-xl">
          A free, open-source Chrome extension that turns any website into a
          live design surface. Edit layout, type, colour, spacing and
          structure, then ship the result straight to Claude Code, Cursor, or
          any AI coding agent over MCP.
        </p>

        {/* Secondary on the LEFT (Try by yourself → /demo), primary on the RIGHT (Add to Chrome) */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Button variant="outline" asChild>
            <Link href="/demo">Try by yourself</Link>
          </Button>
          <AddToChromeCta />
        </div>
      </div>
    </section>
  );
};

export const HeroShowcase = () => {
  return (
    <section className="pb-12 lg:pb-16">
      <div className="container flex flex-col gap-10 py-6 lg:flex-row lg:items-center lg:gap-16">
        {/* Left — feature bullets */}
        <div className="relative flex flex-1 flex-col justify-center space-y-5 lg:max-w-md lg:pr-10">
          <DashedLine
            orientation="vertical"
            className="absolute top-0 right-0 max-lg:hidden"
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

        {/* Right — cover image */}
        <div className="flex-1">
          <div className="relative mx-auto h-[400px] w-full max-w-md lg:h-[448px]">
            <Image
              src="/cover.png"
              alt="The Design Mode side panel on a live website"
              fill
              className="rounded-2xl object-contain object-top shadow-lg"
              priority
            />
          </div>
        </div>
      </div>
    </section>
  );
};
