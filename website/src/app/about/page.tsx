import { Background } from "@/components/background";
import { WhyThisExists } from "@/components/blocks/about";
import { AboutHero } from "@/components/blocks/about-hero";
import { DashedLine } from "@/components/dashed-line";
import { JsonLd, personSchema } from "@/components/site/json-ld";

export const metadata = {
  title: "About — Why Design Mode exists",
  description:
    "Design Mode is built by Sandeep Baskaran, a design engineer based in Bengaluru. Built to close the loop between visual design intent and AI coding agents — agents write the code, you stay in the design loop.",
  keywords: [
    "Sandeep Baskaran",
    "design engineer",
    "Design Mode creator",
    "open source design tool",
    "why Design Mode",
  ],
  alternates: { canonical: "https://designmode.app/about" },
  openGraph: {
    title: "About — Why Design Mode exists",
    description:
      "Built by Sandeep Baskaran to close the loop between visual design and AI coding agents.",
    url: "https://designmode.app/about",
    images: ["/og-image.png"],
  },
};

export default function AboutPage() {
  return (
    <>
      <JsonLd data={personSchema} />
      {/* Hero — yellow background slab */}
      <Background>
        <section className="pt-28 pb-12 lg:pt-44 lg:pb-16">
          <AboutHero />
        </section>
      </Background>

      {/* Why this exists — yellow background slab */}
      <Background variant="bottom">
        <section className="py-20 lg:py-28">
          <DashedLine className="container max-w-5xl" />
          <div className="mt-16">
            <WhyThisExists />
          </div>
        </section>
      </Background>
    </>
  );
}
