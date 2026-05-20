import { Background } from "@/components/background";
import { FAQ } from "@/components/blocks/faq";
import { Features } from "@/components/blocks/features";
import { Hero, HeroShowcase } from "@/components/blocks/hero";
import { Logos } from "@/components/blocks/logos";
import { ResourceAllocation } from "@/components/blocks/resource-allocation";
// import { Testimonials } from "@/components/blocks/testimonials"; // hidden until real quotes

export default function Home() {
  return (
    <>
      <Background className="via-muted to-muted/80">
        <Hero />
      </Background>
      <HeroShowcase />
      <Logos />
      <Features />
      <ResourceAllocation />
      {/* <Testimonials /> — hidden until we have real quotes */}
      <Background variant="bottom">
        <FAQ />
      </Background>
    </>
  );
}
