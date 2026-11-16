import Link from "next/link";

import { ArrowUpRight } from "lucide-react";

import { Background } from "@/components/background";
import { DashedLine } from "@/components/dashed-line";
import { JsonLd, collectionPageSchema } from "@/components/site/json-ld";
import { SectionHeader, sectionPadding } from "@/components/site/section-header";
import { comparisons, isComparisonIndexable } from "@/content/comparisons";

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
              title="Which browser visual editor fits your workflow?"
              description="Design Mode edits a rendered page and hands the recorded changes to a coding agent. It is not a source editor or a blank canvas."
            />
          </div>
        </section>
      </Background>

      <section className={sectionPadding}>
        <DashedLine className="container max-w-5xl" />
        <div className="container mt-12 grid max-w-5xl gap-6 md:grid-cols-2 lg:grid-cols-3">
          {comparisons.map((comparison) => (
            <Link
              key={comparison.slug}
              href={`/compare/${comparison.slug}`}
              className="group flex flex-col rounded-lg border p-6 transition-shadow hover:shadow-md"
            >
              <span className="text-muted-foreground text-base font-medium tracking-wide uppercase">
                {isComparisonIndexable(comparison)
                  ? "Source-backed comparison"
                  : "Research draft"}
              </span>
              <h2 className="font-display mt-2 text-2xl font-semibold">
                Design Mode vs {comparison.competitor}
              </h2>
              <p className="text-muted-foreground mt-2 text-base leading-relaxed">
                {comparison.oneLiner}
              </p>
              <span className="text-foreground/80 mt-4 inline-flex items-center gap-2 text-base font-medium underline underline-offset-8">
                Read the comparison{" "}
                <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
