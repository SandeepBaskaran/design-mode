import Link from "next/link";

import { ArrowUpRight } from "lucide-react";

import { PageHero } from "@/components/layout/page-hero";
import { PageSection } from "@/components/layout/page-section";
import { JsonLd, collectionPageSchema } from "@/components/site/json-ld";
import { useCases } from "@/content/use-cases";

export const metadata = {
  title: {
    absolute: "Visual editing workflows for AI coding agents | DIVE",
  },
  description:
    "Practical workflows for editing a rendered webpage, recording exact changes and handing a structured specification to a coding agent or developer.",
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
    type: "website",
    title: "Visual editing workflows for AI coding agents | DIVE",
    description:
      "Practical workflows for editing a rendered webpage, recording exact changes and handing a structured specification to a coding agent or developer.",
    url: "https://designmode.app/use-cases",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "DIVE — The visual editor for all your agent’s work",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Visual editing workflows for AI coding agents | DIVE",
    description:
      "Practical workflows for editing a rendered webpage, recording exact changes and handing a structured specification to a coding agent or developer.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "DIVE — The visual editor for all your agent’s work",
      },
    ],
  },
};

export default function UseCasesIndex() {
  return (
    <>
      <JsonLd
        data={collectionPageSchema({
          name: "Visual editing workflows for AI coding agents",
          description:
            "Practical workflows for rendered-page editing and structured coding-agent hand-off.",
          url: "https://designmode.app/use-cases",
          items: useCases.map((item) => ({
            name: item.title,
            url: `https://designmode.app/use-cases/${item.slug}`,
          })),
        })}
      />
      <PageHero
        title="Workflows for visual editing and agent hand-off"
        description={
          <>
            Start with the shared loop: make the intended change on the rendered
            interface, capture the exact specification, then ask a coding agent
            or developer to update and verify the source. The examples below
            apply that loop to specific jobs.
          </>
        }
      />

      <PageSection tone="body" width="5xl">
        <div className="container mt-12 grid max-w-5xl gap-6 md:grid-cols-2 lg:grid-cols-3">
          {useCases.map((u) => (
            <Link
              key={u.slug}
              href={`/use-cases/${u.slug}`}
              className="group flex flex-col rounded-2xl border p-6 transition-shadow hover:shadow-md"
            >
              <span className="text-muted-foreground text-base font-medium tracking-wide uppercase">
                {u.persona}
              </span>
              <h2 className="font-display mt-2 text-2xl leading-snug font-semibold">
                {u.title}
              </h2>
              <p className="text-muted-foreground mt-2 text-base leading-relaxed">
                {u.intro.split(". ")[0]}.
              </p>
              <span className="text-foreground/80 mt-4 inline-flex items-center gap-2 text-base font-medium underline underline-offset-8">
                Read the workflow{" "}
                <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </PageSection>
    </>
  );
}
