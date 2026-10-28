import Link from "next/link";

import { ArrowUpRight } from "lucide-react";

import { PageHero } from "@/components/layout/page-hero";
import { PageSection } from "@/components/layout/page-section";
import { JsonLd, collectionPageSchema } from "@/components/site/json-ld";
import { docs } from "@/content/docs";

export const metadata = {
  title: { absolute: "DIVE documentation" },
  description:
    "Install DIVE, configure Claude Code or Cursor, understand browser support and the Changes tab, and troubleshoot common issues.",
  keywords: [
    "DIVE docs",
    "DIVE documentation",
    "DIVE install guide",
    "DIVE troubleshooting",
    "DIVE shortcuts",
  ],
  alternates: { canonical: "https://designmode.app/docs" },
  openGraph: {
    type: "website",
    title: "DIVE documentation",
    description:
      "Install DIVE, configure Claude Code or Cursor, understand browser support and the Changes tab, and troubleshoot common issues.",
    url: "https://designmode.app/docs",
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
    title: "DIVE documentation",
    description:
      "Install DIVE, configure Claude Code or Cursor, understand browser support and the Changes tab, and troubleshoot common issues.",
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

export default function DocsIndex() {
  return (
    <>
      <JsonLd
        data={collectionPageSchema({
          name: "DIVE documentation",
          description:
            "Installation, browser support, MCP setup, the Changes tab and troubleshooting.",
          url: "https://designmode.app/docs",
          items: docs.map((doc) => ({
            name: doc.title,
            url: `https://designmode.app/docs/${doc.slug}`,
          })),
        })}
      />
      <PageHero
        title="Docs"
        description={
          <>
            How to install DIVE, set up MCP for your AI coding agent,
            work with the Changes tab, and fix common issues.
          </>
        }
      />

      <PageSection tone="body" width="5xl">
        <div className="container mt-12 grid max-w-5xl gap-6 md:grid-cols-2 lg:grid-cols-3">
          {docs.map((d) => (
            <Link
              key={d.slug}
              href={`/docs/${d.slug}`}
              className="group flex flex-col rounded-2xl border p-6 transition-shadow hover:shadow-md"
            >
              <h2 className="font-display text-2xl font-semibold">{d.title}</h2>
              <p className="text-muted-foreground mt-2 text-base leading-relaxed">
                {d.intro}
              </p>
              <span className="text-foreground/80 mt-4 inline-flex items-center gap-2 text-base font-medium underline underline-offset-8">
                Read{" "}
                <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </PageSection>
    </>
  );
}
