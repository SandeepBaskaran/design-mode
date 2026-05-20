import { Background } from "@/components/background";
import { FAQ } from "@/components/blocks/faq";
import { Features } from "@/components/blocks/features";
import { Hero, HeroShowcase } from "@/components/blocks/hero";
import { Logos } from "@/components/blocks/logos";
import { ProductHunt } from "@/components/blocks/product-hunt";
import { ResourceAllocation } from "@/components/blocks/resource-allocation";
import { Testimonials } from "@/components/blocks/testimonials";

export default function Home() {
  return (
    <>
      <Background className="via-muted to-muted/80">
        <Hero />
      </Background>
      <HeroShowcase />
      <ProductHunt />
      <Logos />
      <Features />
      <ResourceAllocation />
      <Testimonials />
      <Background variant="bottom">
        <FAQ />
      </Background>
    </>
  );
}
