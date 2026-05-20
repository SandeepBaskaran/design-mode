import { Background } from "@/components/background";
import { WhyThisExists } from "@/components/blocks/about";
import { AboutHero } from "@/components/blocks/about-hero";
import { DashedLine } from "@/components/dashed-line";

export default function AboutPage() {
  return (
    <>
      {/* Hero — yellow background slab */}
      <Background>
        <section className="py-28 lg:py-32 lg:pt-44">
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
