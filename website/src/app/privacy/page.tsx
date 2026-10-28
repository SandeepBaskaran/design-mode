"use client";

import Privacy from "./privacy.mdx";
import Reporting from "./reporting.mdx";

import { PageHero } from "@/components/layout/page-hero";
import { PageSection } from "@/components/layout/page-section";

export default function PrivacyPage() {
  return (
    <>
      {/* Hero — yellow background slab */}
      <PageHero
        title="Privacy"
        description={
          <>
            DIVE runs in your browser. Release builds send usage
            analytics without page content. Here is what else can leave your
            machine, when, and why.
          </>
        }
      />

      {/* Middle — main privacy content */}
      <PageSection tone="body" width="5xl">
        <article data-ds-inline="Privacy policy (MDX)" className="prose container mx-auto mt-12 max-w-3xl">
          <Privacy />
        </article>
      </PageSection>

      {/* Bottom — reporting concerns in yellow slab */}
      <PageSection tone="bottom" width="5xl">
        <article data-ds-inline="Reporting (MDX)" className="prose container mx-auto mt-12 max-w-3xl">
          <Reporting />
        </article>
      </PageSection>
    </>
  );
}
