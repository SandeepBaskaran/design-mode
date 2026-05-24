import React from "react";

import { Background } from "@/components/background";
import {
  ContactChannels,
  ContactHero,
  ContactReports,
} from "@/components/blocks/contact";
import { DashedLine } from "@/components/dashed-line";

export const metadata = {
  title: "Contact — Bug reports, ideas, sponsorship",
  description:
    "Get in touch about Design Mode — email, GitHub issues, Discussions, and security disclosure. Bug? Feature idea? Sponsorship question?",
  keywords: [
    "Design Mode contact",
    "bug report Design Mode",
    "Design Mode support",
    "Design Mode security disclosure",
  ],
  alternates: { canonical: "https://designmode.app/contact" },
  openGraph: {
    title: "Contact — Bug reports, ideas, sponsorship",
    description: "Email, GitHub, security disclosure for Design Mode.",
    url: "https://designmode.app/contact",
    images: ["/og-image.png"],
  },
};

const Page = () => {
  return (
    <>
      {/* Hero — yellow background slab */}
      <Background>
        <section className="py-28 lg:py-32 lg:pt-44">
          <ContactHero />
        </section>
      </Background>

      {/* Middle — channels */}
      <section className="py-16 lg:py-20">
        <DashedLine className="container max-w-5xl" />
        <div className="mt-12">
          <ContactChannels />
        </div>
      </section>

      {/* Bottom — reports + security in yellow slab */}
      <Background variant="bottom">
        <section className="py-20 lg:py-28">
          <DashedLine className="container max-w-5xl" />
          <div className="mt-16">
            <ContactReports />
          </div>
        </section>
      </Background>
    </>
  );
};

export default Page;
