import React from "react";

import { Background } from "@/components/background";
import {
  ContactChannels,
  ContactHero,
  ContactReports,
} from "@/components/blocks/contact";
import { DashedLine } from "@/components/dashed-line";

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
