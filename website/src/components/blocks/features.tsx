import Image from "next/image";
import Link from "next/link";

import { ChevronRight } from "lucide-react";

import { DashedLine } from "../dashed-line";

import { Card, CardContent } from "@/components/ui/card";

const items = [
  {
    title: "Inspect any element on any site",
    image: "/features/inspect-card.png",
    href: "/mcp",
  },
  {
    title: "Edit type, colour, layout, structure",
    image: "/features/edit-card.png",
    href: "/demo",
  },
  {
    title: "Ship the diff straight to your agent",
    image: "/features/ship-card.png",
    href: "/mcp",
  },
];

export const Features = () => {
  return (
    <section id="features" className="pb-28 lg:pb-32">
      <div className="container">
        {/* Top dashed line with text */}
        <div className="relative flex items-center justify-center">
          <DashedLine className="text-muted-foreground" />
          <span className="border-border bg-card text-muted-foreground absolute rounded-full border px-3 py-1 text-sm font-medium tracking-wide max-md:hidden">
            DESIGN ON THE LIVE PAGE.
          </span>
        </div>

        {/* Content — vertical stack of title + body */}
        <div className="mx-auto mt-10 flex max-w-4xl flex-col gap-4 lg:mt-24">
          <h2 className="text-2xl tracking-tight md:text-4xl lg:text-5xl">
            Made for the vibe-coding loop
          </h2>
          <p className="text-muted-foreground max-w-2xl leading-snug">
            Most design-to-code workflows force you to mock the change, paste
            a screenshot, and hope your AI agent guesses your CSS. Design
            Mode skips the mocking step entirely — edit the real, rendered
            page in your browser, capture a structured diff (selector →
            property → value), and ship it to Claude Code, Cursor, Claude
            Desktop, Windsurf, Cline, or any MCP-compatible agent in one
            click.
          </p>
        </div>

        {/* Features Card */}
        <Card className="mt-8 rounded-3xl md:mt-12 lg:mt-20">
          <CardContent className="flex p-0 max-md:flex-col">
            {items.map((item, i) => (
              <div key={i} className="flex flex-1 max-md:flex-col">
                <div className="flex-1 p-4 pe-0! md:p-6">
                  <div className="relative aspect-[1.28/1] overflow-hidden">
                    <Image
                      src={item.image}
                      alt={`${item.title} interface`}
                      fill
                      className="object-cover object-left-top ps-4 pt-2"
                    />
                    <div className="from-background absolute inset-0 z-10 bg-linear-to-t via-transparent to-transparent" />
                  </div>

                  <Link
                    href={item.href}
                    className="group flex items-center justify-between gap-4 pe-4 pt-4 md:pe-6 md:pt-6"
                  >
                    <h3 className="font-display max-w-60 text-2xl leading-tight font-bold tracking-tight">
                      {item.title}
                    </h3>
                    <div className="rounded-full border p-2 transition-colors group-hover:border-primary group-hover:bg-primary/10">
                      <ChevronRight className="size-6 transition-transform group-hover:translate-x-1 lg:size-9" />
                    </div>
                  </Link>
                </div>
                {i < items.length - 1 && (
                  <div className="relative hidden md:block">
                    <DashedLine orientation="vertical" />
                  </div>
                )}
                {i < items.length - 1 && (
                  <div className="relative block md:hidden">
                    <DashedLine orientation="horizontal" />
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  );
};
