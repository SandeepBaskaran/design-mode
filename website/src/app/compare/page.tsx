import Link from "next/link";

import { ArrowUpRight } from "lucide-react";

import { Background } from "@/components/background";
import { DashedLine } from "@/components/dashed-line";
import { JsonLd, collectionPageSchema } from "@/components/site/json-ld";
import { SectionHeader, sectionPadding } from "@/components/site/section-header";
import { comparisons, isComparisonIndexable } from "@/content/comparisons";
import { iconFor } from "./icons";

const pageTitle = "Browser visual editors and AI feedback tools";
const pageDescription =
  "Compare live-page editors, browser inspectors, annotation tools, Figma-to-code products and editor-native design modes by the workflow they actually support.";

export const metadata = {
  title: { absolute: `${pageTitle} | Design Mode` },
  description: pageDescription,
  alternates: { canonical: "https://designmode.app/compare" },
  openGraph: {
    type: "website",
    title: `${pageTitle} | Design Mode`,
    description: pageDescription,
    url: "https://designmode.app/compare",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Design Mode — The visual editor for all your agent’s work",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${pageTitle} | Design Mode`,
    description: pageDescription,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Design Mode — The visual editor for all your agent’s work",
      },
    ],
  },
};

export default function ComparisonsIndex() {
  return (
    <>
      <JsonLd
        data={collectionPageSchema({
          name: pageTitle,
          description: pageDescription,
          url: "https://designmode.app/compare",
          items: comparisons.filter(isComparisonIndexable).map((item) => ({
            name: `Design Mode vs ${item.competitor}`,
            url: `https://designmode.app/compare/${item.slug}`,
          })),
        })}
      />

      <Background>
        <section className={sectionPadding}>
          <div className="container max-w-5xl">
            <SectionHeader
              as="h1"
              eyebrow="Compare"
              title="Find the right editor"
              description="Design Mode edits a rendered page and hands the recorded changes to a coding agent. It is not a source editor or a blank canvas."
            />
          </div>
        </section>
      </Background>

      <section className={sectionPadding}>
        <DashedLine className="container max-w-5xl" />
        <div className="container mt-12 flex max-w-5xl flex-col gap-3">
          {comparisons.map((comparison) => {
            const icon = iconFor(comparison.slug);
            return (
              <Link
                key={comparison.slug}
                href={`/compare/${comparison.slug}`}
                className="group flex items-center gap-4 rounded-2xl border p-4 transition-shadow hover:shadow-md sm:p-5"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={icon.src}
                  alt=""
                  width={32}
                  height={32}
                  className="size-8 shrink-0 rounded-md"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-xl font-semibold sm:text-2xl">
                      Design Mode vs {comparison.competitor}
                    </h2>
                    <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-sm">
                      {isComparisonIndexable(comparison)
                        ? "Source-backed"
                        : "Research draft"}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-1 line-clamp-2 text-base leading-relaxed">
                    {comparison.oneLiner}
                  </p>
                </div>
                <ArrowUpRight
                  aria-hidden="true"
                  className="text-foreground size-5 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                />
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}
