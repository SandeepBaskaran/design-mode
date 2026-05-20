"use client";

import Privacy from "./privacy.mdx";

import { Background } from "@/components/background";
import { DashedLine } from "@/components/dashed-line";

export default function PrivacyPage() {
  return (
    <Background>
      <section className="py-28 lg:py-32 lg:pt-44">
        <div className="container max-w-5xl">
          <h1 className="text-3xl tracking-tight sm:text-4xl md:text-5xl">
            Privacy
          </h1>
          <p className="text-muted-foreground mt-4 max-w-3xl text-lg md:text-xl">
            Design Mode runs locally by default. Here's exactly what data
            leaves your machine, when, and why.
          </p>
        </div>

        <DashedLine className="container mt-16 max-w-5xl" />

        <article className="prose prose-lg container mx-auto mt-12 max-w-3xl">
          <Privacy />
        </article>
      </section>
    </Background>
  );
}
