import { WhyThisExists } from "@/components/blocks/about";
import { AboutHero } from "@/components/blocks/about-hero";
import { PageSection } from "@/components/layout/page-section";

export const metadata = {
  title: { absolute: "About DIVE | DIVE" },
  description:
    "What DIVE — Design Intelligence & Visual Engineering — does: visual editing of live web pages, handed to coding agents through MCP. Built on Design Mode by Sandeep Baskaran (MIT).",
  keywords: [
    "DIVE",
    "Design Intelligence & Visual Engineering",
    "open source design tool",
    "Design Mode",
  ],
  alternates: { canonical: "https://designmode.app/about" },
  openGraph: {
    type: "website",
    title: "About DIVE | DIVE",
    description:
      "What DIVE — Design Intelligence & Visual Engineering — does: visual editing of live web pages, handed to coding agents through MCP. Built on Design Mode by Sandeep Baskaran (MIT).",
    url: "https://designmode.app/about",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "DIVE — The visual editor for all your agent’s work",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "About DIVE | DIVE",
    description:
      "What DIVE — Design Intelligence & Visual Engineering — does: visual editing of live web pages, handed to coding agents through MCP. Built on Design Mode by Sandeep Baskaran (MIT).",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "DIVE — The visual editor for all your agent’s work",
      },
    ],
  },
};

export default function AboutPage() {
  return (
    <>
      {/* Hero — yellow background slab */}
      <PageSection tone="hero">
        <AboutHero />
      </PageSection>

      {/* Why this exists — yellow background slab */}
      <PageSection tone="bottom" width="5xl">
        <div className="mt-16">
          <WhyThisExists />
        </div>
      </PageSection>
    </>
  );
}
