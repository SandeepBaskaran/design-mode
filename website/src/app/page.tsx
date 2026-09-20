import { Background } from "@/components/background";
import { FAQ, homepageFaqQA } from "@/components/blocks/faq";
import { Features } from "@/components/blocks/features";
import { Hero, HeroShowcase } from "@/components/blocks/hero";
import { HeroImage } from "@/components/blocks/hero-image";
import { PanelAnatomy } from "@/components/blocks/panel-anatomy";
import {
  JsonLd,
  faqSchema,
  softwareApplicationSchema,
} from "@/components/site/json-ld";
// import { Testimonials } from "@/components/blocks/testimonials"; // hidden until real quotes

const homeTitle = "Design Mode — Browser visual editor for AI coding agents";
const homeDescription =
  "Edit a rendered webpage visually, record exact changes, and hand them to Claude Code, Cursor or another compatible coding agent.";

export const metadata = {
  title: { absolute: homeTitle },
  description: homeDescription,
  alternates: { canonical: "https://designmode.app/" },
  openGraph: {
    type: "website",
    title: homeTitle,
    description: homeDescription,
    url: "https://designmode.app/",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Design Mode browser visual editor for AI coding agents",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: homeTitle,
    description: homeDescription,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Design Mode browser visual editor for AI coding agents",
      },
    ],
  },
};

export default function Home() {
  return (
    <>
      <JsonLd data={softwareApplicationSchema} />
      <JsonLd data={faqSchema(homepageFaqQA)} />
      <Background>
        <Hero />
      </Background>
      <HeroShowcase />
      <Features />
      <PanelAnatomy />
      {/* <Testimonials /> — hidden until we have real quotes */}
      <Background variant="bottom">
        <FAQ />
      </Background>
      <HeroImage />
    </>
  );
}
