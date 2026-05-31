import Link from "next/link";

import { ArrowUpRight } from "lucide-react";

import { Background } from "@/components/background";
import { DashedLine } from "@/components/dashed-line";
import { docs } from "@/content/docs";

export const metadata = {
  title: "Docs — Install, MCP setup, shortcuts, troubleshooting",
  description:
    "Design Mode documentation: how to install, keyboard shortcuts, MCP setup for Claude Code / Cursor / Windsurf, the Changes tab, and troubleshooting.",
  keywords: [
    "Design Mode docs",
    "Design Mode documentation",
    "Design Mode install guide",
    "Design Mode troubleshooting",
    "Design Mode shortcuts",
  ],
  alternates: { canonical: "https://designmode.app/docs" },
  openGraph: {
    title: "Docs — Design Mode",
    description: "Install, MCP setup, shortcuts, troubleshooting.",
    url: "https://designmode.app/docs",
    images: ["/og-image.png"],
  },
};

export default function DocsIndex() {
  return (
    <>
      <Background>
        <section className="pt-28 pb-12 lg:pt-44 lg:pb-16">
          <div className="container max-w-5xl">
            <h1 className="text-3xl tracking-tight sm:text-4xl md:text-5xl">
              Docs
            </h1>
            <p className="text-muted-foreground mt-4 max-w-3xl text-lg md:text-xl">
              How to install Design Mode, set up MCP for your AI coding
              agent, work with the Changes tab, and fix common issues.
            </p>
          </div>
        </section>
      </Background>

      <section className="py-16 lg:py-20">
        <DashedLine className="container max-w-5xl" />
        <div className="container mt-12 grid max-w-5xl gap-6 md:grid-cols-2 lg:grid-cols-3">
          {docs.map((d) => (
            <Link
              key={d.slug}
              href={`/docs/${d.slug}`}
              className="group flex flex-col rounded-2xl border p-6 transition-shadow hover:shadow-md"
            >
              <h2 className="font-display text-lg font-semibold">
                {d.title}
              </h2>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                {d.intro}
              </p>
              <span className="text-foreground/80 mt-4 inline-flex items-center gap-1 text-sm font-medium underline underline-offset-4">
                Read{" "}
                <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
