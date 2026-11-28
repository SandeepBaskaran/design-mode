"use client";

import Privacy from "./privacy.mdx";
import Reporting from "./reporting.mdx";

import { Background } from "@/components/background";
import { SectionHeader, sectionPadding } from "@/components/site/section-header";

export default function PrivacyPage() {
  return (
    <>
      <Background>
        <section className={sectionPadding}>
          <div className="container max-w-5xl">
            <SectionHeader
              as="h1"
              eyebrow="Legal"
              title="Privacy"
              description="Design Mode runs in your browser. Release builds send usage analytics without page content. Here is what else can leave your machine, when, and why."
            />
          </div>
        </section>
      </Background>

      <section className={sectionPadding}>
        <article className="prose container mx-auto max-w-3xl">
          <Privacy />
        </article>
      </section>

      <Background variant="bottom">
        <section className={sectionPadding}>
          <article className="prose container mx-auto max-w-3xl">
            <Reporting />
          </article>
        </section>
      </Background>
    </>
  );
}
