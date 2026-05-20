import { Background } from "@/components/background";
import { FAQ } from "@/components/blocks/faq";
import { Features } from "@/components/blocks/features";
import { Hero, HeroShowcase } from "@/components/blocks/hero";
import { HeroImage } from "@/components/blocks/hero-image";
import { Logos } from "@/components/blocks/logos";
import { PanelAnatomy } from "@/components/blocks/panel-anatomy";
// import { Testimonials } from "@/components/blocks/testimonials"; // hidden until real quotes

export default function Home() {
  return (
    <>
      <Background className="via-muted to-muted/80">
        <Hero />
      </Background>
      <HeroImage />
      <HeroShowcase />
      <Logos />
      <Features />
      <PanelAnatomy />
      {/* <Testimonials /> — hidden until we have real quotes */}
      <Background variant="bottom">
        <FAQ />
      </Background>
    </>
  );
}
