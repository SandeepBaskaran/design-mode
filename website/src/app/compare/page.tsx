import Link from "next/link";

import { ArrowUpRight } from "lucide-react";

import { Background } from "@/components/background";
import { DashedLine } from "@/components/dashed-line";
import { comparisons } from "@/content/comparisons";

export const metadata = {
  title:
    "Comparisons — Design Mode vs Stagewise, DevTools, Figma Dev Mode & more",
  description:
    "Honest comparisons of Design Mode against every adjacent tool: Stagewise, pls-fix, Agentation, Dialkit, UI Inspector, Cursor's design mode, CSSPeeper, Hover Inspector, Builder.io Visual Copilot, Locofy, Chrome DevTools, Figma Dev Mode, VisBug.",
  keywords: [
    "Design Mode alternative",
    "Stagewise alternative",
    "Chrome DevTools alternative",
    "Figma Dev Mode alternative",
    "VisBug alternative",
    "visual editor comparison",
    "AI design tool comparison",
  ],
  alternates: { canonical: "https://designmode.app/compare" },
  openGraph: {
    title: "Comparisons — Design Mode",
    description:
      "Honest side-by-side comparisons against every adjacent design + visual-editing tool.",
    url: "https://designmode.app/compare",
    images: ["/og-image.png"],
  },
};

export default function ComparisonsIndex() {
  return (
    <>
      <Background>
        <section className="py-28 lg:py-32 lg:pt-44">
          <div className="container max-w-5xl">
            <h1 className="text-3xl tracking-tight sm:text-4xl md:text-5xl">
              Design Mode vs everything else
            </h1>
            <p className="text-muted-foreground mt-4 max-w-3xl text-lg md:text-xl">
              Honest, no-disparagement side-by-sides against every
              adjacent tool — visual editors, browser inspectors, Figma
              plugins, and in-editor design modes. Pick the one that fits
              your workflow. If that one isn&apos;t Design Mode, that&apos;s
              fine too.
            </p>
          </div>
        </section>
      </Background>

      <section className="py-16 lg:py-20">
        <DashedLine className="container max-w-5xl" />
        <div className="container mt-12 grid max-w-5xl gap-6 md:grid-cols-2 lg:grid-cols-3">
          {comparisons.map((c) => (
            <Link
              key={c.slug}
              href={`/compare/${c.slug}`}
              className="group flex flex-col rounded-2xl border p-6 transition-shadow hover:shadow-md"
            >
              <h2 className="font-display text-lg font-semibold">
                vs {c.competitor}
              </h2>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                {c.oneLiner}
              </p>
              <span className="text-foreground/80 mt-4 inline-flex items-center gap-1 text-sm font-medium underline underline-offset-4">
                Read the comparison{" "}
                <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
