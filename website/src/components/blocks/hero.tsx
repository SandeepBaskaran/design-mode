import Image from "next/image";
import Link from "next/link";

import { Heart, MousePointer2, Palette, Ruler, Wand2 } from "lucide-react";

import { HeroHeadline } from "@/components/blocks/hero-headline";
import { DashedLine } from "@/components/dashed-line";
import { AddToChromeCta } from "@/components/site/add-to-chrome-cta";
import { Button } from "@/components/ui/button";

const features = [
  {
    title: "Inspect anything",
    description:
      "Inspect elements on a scriptable webpage and edit the rendered result visually.",
    icon: MousePointer2,
  },
  {
    title: "Layout, type, colour",
    description:
      "A full design surface in the side panel — not a devtools fork.",
    icon: Palette,
  },
  {
    title: "Measure & resize",
    description:
      "Drag 8 handles to resize, and see pixel spacing between elements live.",
    icon: Ruler,
  },
  {
    title: "Ship to your agent",
    description:
      "Copy a structured specification or send it to a compatible MCP client.",
    icon: Wand2,
  },
  {
    title: "Free and open source",
    description:
      "MIT-licensed, no account required, and no product telemetry in the extension.",
    icon: Heart,
  },
];

export const Hero = () => {
  return (
    <section className="py-16 sm:py-24">
      {/* Hero — vertical stack, centred */}
      <div className="container max-w-[1200px] text-center max-sm:px-4">
        <HeroHeadline />

        <p className="text-muted-foreground mx-auto mt-8 max-w-[848px] text-[14px] sm:text-[20px]">
          <span className="sm:hidden">Edit</span>
          <span className="max-sm:hidden">
            Design Mode is a free, open-source Chrome and Firefox extension that
            lets you edit
          </span>{" "}
          a rendered webpage visually, record the exact changes, and hand them
          to a coding agent.
        </p>

        {/* Secondary on the LEFT (Try by yourself → /demo), primary on the RIGHT (Add to Chrome) */}
        <div className="mt-16 grid grid-cols-2 items-stretch gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-4">
          <AddToChromeCta
            size="lg"
            className="h-14 max-sm:w-full max-sm:px-2 max-sm:py-1 max-sm:text-[14px]"
          />
          <Button
            variant="outline"
            size="lg"
            className="h-14 max-sm:w-full max-sm:px-2 max-sm:py-1 max-sm:text-[14px]"
            asChild
          >
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
        <div className="relative flex flex-1 flex-col justify-center space-y-4 lg:max-w-md lg:pl-10">
          <DashedLine
            orientation="vertical"
            className="absolute top-0 left-0 max-lg:hidden"
          />
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="flex gap-2 lg:gap-8">
                <Icon className="text-foreground mt-2 size-4 shrink-0 lg:size-6" />
                <div>
                  <h2 className="font-text text-foreground font-semibold">
                    {feature.title}
                  </h2>
                  <p className="text-muted-foreground max-w-76 text-base">
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
