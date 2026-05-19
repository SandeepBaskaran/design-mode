import Image from "next/image";

import { ArrowRight, Heart, MousePointer2, Palette, Wand2 } from "lucide-react";

import { DashedLine } from "@/components/dashed-line";
import { Button } from "@/components/ui/button";

const CWS_URL =
  "https://chromewebstore.google.com/detail/design-mode/ighgobegfcmjagombgnfhgioflinojih";
const REPO_URL = "https://github.com/SandeepBaskaran/design-mode";

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
    <section className="py-28 lg:py-32 lg:pt-44">
      <div className="container flex flex-col justify-between gap-8 md:gap-14 lg:flex-row lg:gap-20">
        {/* Left side - Main content */}
        <div className="flex-1">
          <h1 className="text-foreground max-w-160 text-3xl tracking-tight md:text-4xl lg:text-5xl">
            Design directly in your browser.
            <br className="hidden md:block" /> Your agent writes the code.
          </h1>

          <p className="text-muted-foreground mt-5 text-lg md:text-xl">
            A free, open-source Chrome extension that turns any website into a
            live design surface. Edit layout, type, colour, spacing and
            structure, then ship the result straight to Claude Code, Cursor, or
            any AI coding agent over MCP.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4 lg:flex-nowrap">
            <Button asChild>
              <a href={CWS_URL} target="_blank" rel="noopener noreferrer">
                Add to Chrome
              </a>
            </Button>
            <Button
              variant="outline"
              className="from-background h-auto gap-2 bg-linear-to-r to-transparent shadow-md"
              asChild
            >
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
                Read the docs on GitHub
                <ArrowRight className="stroke-3" />
              </a>
            </Button>
          </div>
        </div>

        {/* Right side - Features */}
        <div className="relative flex flex-1 flex-col justify-center space-y-5 max-lg:pt-10 lg:pl-10">
          <DashedLine
            orientation="vertical"
            className="absolute top-0 left-0 max-lg:hidden"
          />
          <DashedLine
            orientation="horizontal"
            className="absolute top-0 lg:hidden"
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

      <div className="mt-12 max-lg:ml-6 max-lg:h-[550px] max-lg:overflow-hidden md:mt-20 lg:container lg:mt-24">
        <div className="relative mx-auto h-[793px] w-full max-w-3xl">
          <Image
            src="/cover.png"
            alt="The Design Mode side panel on a live website"
            fill
            className="rounded-2xl object-contain object-top shadow-lg"
            priority
          />
        </div>
      </div>
    </section>
  );
};
