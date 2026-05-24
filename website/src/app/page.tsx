import { Background } from "@/components/background";
import { FAQ, homepageFaqQA } from "@/components/blocks/faq";
import { Features } from "@/components/blocks/features";
import { Hero, HeroShowcase } from "@/components/blocks/hero";
import { HeroImage } from "@/components/blocks/hero-image";
import { Logos } from "@/components/blocks/logos";
import { PanelAnatomy } from "@/components/blocks/panel-anatomy";
import { PersonaBlock } from "@/components/blocks/persona-block";
import {
  JsonLd,
  faqSchema,
  softwareApplicationSchema,
} from "@/components/site/json-ld";
// import { Testimonials } from "@/components/blocks/testimonials"; // hidden until real quotes

export default function Home() {
  return (
    <>
      <JsonLd data={softwareApplicationSchema} />
      <JsonLd data={faqSchema(homepageFaqQA)} />
      <Background>
        <Hero />
      </Background>
      <HeroShowcase />
      <Logos />
      <Features />
      <PanelAnatomy />
      <PersonaBlock />
      {/* <Testimonials /> — hidden until we have real quotes */}
      <Background variant="bottom">
        <FAQ />
      </Background>
      <HeroImage />
    </>
  );
}
