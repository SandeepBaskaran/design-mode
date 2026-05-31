import Link from "next/link";

import { ArrowUpRight } from "lucide-react";

import { Background } from "@/components/background";
import { DashedLine } from "@/components/dashed-line";
import { useCases } from "@/content/use-cases";

export const metadata = {
  title:
    "Use cases — One design tool for designers, developers, QA, PMs & vibe coders",
  description:
    "Real workflows for Design Mode: vibe coding with Claude Code, visual editing with Cursor, UI testing exports to developers with full context, design review in production, copy edits without a PR, accessibility fixes, design-system audits, agency handoff — and more.",
  keywords: [
    "design tool use cases",
    "design workflows",
    "vibe coding workflow",
    "UI testing workflow",
    "design handoff workflow",
    "design system audit",
    "design review",
    "AI agent design workflow",
  ],
  alternates: { canonical: "https://designmode.app/use-cases" },
  openGraph: {
    title: "Use cases — Design Mode",
    description:
      "One design tool for every maker. Workflows by persona — designers, developers, QA, PMs, content, indie hackers, agencies, vibe coders.",
    url: "https://designmode.app/use-cases",
    images: ["/og-image.png"],
  },
};

export default function UseCasesIndex() {
  return (
    <>
      <Background>
        <section className="pt-28 pb-12 lg:pt-44 lg:pb-16">
          <div className="container max-w-5xl">
            <h1 className="text-3xl tracking-tight sm:text-4xl md:text-5xl">
              One design tool for every maker
            </h1>
            <p className="text-muted-foreground mt-4 max-w-3xl text-lg md:text-xl">
              Designers, developers, design engineers, QA testers, PMs,
              content and marketing teams, indie hackers, solo founders,
              agencies, design-system maintainers, and vibe coders — every
              role shares the same problem: getting from a visual idea to
              working code without losing intent. These are the workflows
              Design Mode is built for.
            </p>
          </div>
        </section>
      </Background>

      <section className="py-16 lg:py-20">
        <DashedLine className="container max-w-5xl" />
        <div className="container mt-12 grid max-w-5xl gap-6 md:grid-cols-2 lg:grid-cols-3">
          {useCases.map((u) => (
            <Link
              key={u.slug}
              href={`/use-cases/${u.slug}`}
              className="group flex flex-col rounded-2xl border p-6 transition-shadow hover:shadow-md"
            >
              <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {u.persona}
              </span>
              <h2 className="font-display mt-2 text-lg font-semibold leading-snug">
                {u.title}
              </h2>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                {u.intro.split(". ")[0]}.
              </p>
              <span className="text-foreground/80 mt-4 inline-flex items-center gap-1 text-sm font-medium underline underline-offset-4">
                Read the workflow{" "}
                <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
