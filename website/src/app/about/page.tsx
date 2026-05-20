import { Background } from "@/components/background";
import About, { WhyThisExists } from "@/components/blocks/about";
import { AboutHero } from "@/components/blocks/about-hero";
import { Investors } from "@/components/blocks/investors";
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

      {/* Middle — about content + investors */}
      <section className="py-16 lg:py-20">
        <DashedLine className="container max-w-5xl" />

        <About />

        <div className="pt-28 lg:pt-32">
          <DashedLine className="container max-w-5xl scale-x-115" />
          <Investors />
        </div>
      </section>

      {/* Bottom — Why this exists in yellow slab */}
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
