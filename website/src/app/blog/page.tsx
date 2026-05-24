import Link from "next/link";

import { ArrowUpRight } from "lucide-react";

import { Background } from "@/components/background";
import { DashedLine } from "@/components/dashed-line";
import { posts } from "@/content/blog";

export const metadata = {
  title: "Blog — Design Mode build notes & workflow walkthroughs",
  description:
    "Stories from building Design Mode and walkthroughs of real workflows: MCP architecture, vibe coding loops, changelog deep-dives, Tailwind redesigns with Claude Code.",
  keywords: [
    "Design Mode blog",
    "vibe coding articles",
    "MCP articles",
    "Claude Code blog",
    "AI design agent",
  ],
  alternates: { canonical: "https://designmode.app/blog" },
  openGraph: {
    title: "Blog — Design Mode",
    description:
      "Build notes and workflow walkthroughs for designers, developers, and vibe coders.",
    url: "https://designmode.app/blog",
    images: ["/og-image.png"],
  },
};

const dateFmt = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

export default function BlogIndex() {
  const sorted = [...posts].sort((a, b) =>
    b.datePublished.localeCompare(a.datePublished),
  );

  return (
    <>
      <Background>
        <section className="py-28 lg:py-32 lg:pt-44">
          <div className="container max-w-5xl">
            <h1 className="text-3xl tracking-tight sm:text-4xl md:text-5xl">
              Blog
            </h1>
            <p className="text-muted-foreground mt-4 max-w-3xl text-lg md:text-xl">
              Build notes from Design Mode and walkthroughs of real
              workflows — MCP architecture, vibe coding, Tailwind
              redesigns, changelog deep-dives.
            </p>
          </div>
        </section>
      </Background>

      <section className="py-16 lg:py-20">
        <DashedLine className="container max-w-5xl" />
        <div className="container mt-12 max-w-5xl space-y-6">
          {sorted.map((p) => (
            <Link
              key={p.slug}
              href={`/blog/${p.slug}`}
              className="group block rounded-2xl border p-6 transition-shadow hover:shadow-md"
            >
              <time
                dateTime={p.datePublished}
                className="text-muted-foreground text-xs font-medium tracking-wide uppercase"
              >
                {dateFmt.format(new Date(p.datePublished))}
              </time>
              <h2 className="font-display mt-2 text-xl font-semibold leading-snug md:text-2xl">
                {p.title}
              </h2>
              <p className="text-muted-foreground mt-2 leading-relaxed">
                {p.excerpt}
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
