import { Background } from "@/components/background";
import { AgentWorkflow } from "@/components/blocks/agent-workflow";
import { BrowserHandoff } from "@/components/blocks/browser-handoff";
import { ClosingCta } from "@/components/blocks/closing-cta";
import { FAQ, homepageFaqQA } from "@/components/blocks/faq";
import { Hero } from "@/components/blocks/hero";
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
        url: "/og-design-mode-inter-v3.png",
        width: 1200,
        height: 630,
        alt: "Design Mode — The visual editor for all your agent’s work",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: homeTitle,
    description: homeDescription,
    images: [
      {
        url: "/og-design-mode-inter-v3.png",
        width: 1200,
        height: 630,
        alt: "Design Mode — The visual editor for all your agent’s work",
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
      <AgentWorkflow />
      <PanelAnatomy />
      {/* <Testimonials /> — hidden until we have real quotes */}
      <FAQ />
      <BrowserHandoff />
      <Background variant="bottom">
        <ClosingCta />
      </Background>
    </>
  );
}
