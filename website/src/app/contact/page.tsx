import React from "react";

import {
  ContactChannels,
  ContactHero,
  ContactReports,
} from "@/components/blocks/contact";
import { PageSection } from "@/components/layout/page-section";

export const metadata = {
  title: { absolute: "Contact and support | DIVE" },
  description:
    "Get in touch about DIVE — email, GitHub issues, Discussions, and security disclosure. Bug? Feature idea? Sponsorship question?",
  keywords: [
    "DIVE contact",
    "bug report DIVE",
    "DIVE support",
    "DIVE security disclosure",
  ],
  alternates: { canonical: "https://designmode.app/contact" },
  openGraph: {
    type: "website",
    title: "Contact and support | DIVE",
    description:
      "Get in touch about DIVE — email, GitHub issues, Discussions, and security disclosure. Bug? Feature idea? Sponsorship question?",
    url: "https://designmode.app/contact",
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
    title: "Contact and support | DIVE",
    description:
      "Get in touch about DIVE — email, GitHub issues, Discussions, and security disclosure. Bug? Feature idea? Sponsorship question?",
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

const Page = () => {
  return (
    <>
      {/* Hero — yellow background slab */}
      <PageSection tone="hero">
        <ContactHero />
      </PageSection>

      {/* Middle — channels */}
      <PageSection tone="body" width="5xl">
        <div className="mt-12">
          <ContactChannels />
        </div>
      </PageSection>

      {/* Bottom — reports + security in yellow slab */}
      <PageSection tone="bottom" width="5xl">
        <div className="mt-16">
          <ContactReports />
        </div>
      </PageSection>
    </>
  );
};

export default Page;
