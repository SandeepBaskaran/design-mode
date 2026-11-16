import Link from "next/link";

import { SectionHeader, sectionPadding } from "@/components/site/section-header";

const audiences = [
  {
    title: "Designers and design engineers",
    text: "Make the intended change on the rendered page.",
  },
  {
    title: "Developers with a coding agent",
    text: "Hand the recorded changes to Claude Code, Cursor or another compatible client, then review the source diff.",
  },
  {
    title: "QA, content and product",
    text: "Export precise visual feedback. The extension does not write the code.",
  },
];

export function WhoItsFor() {
  return (
    <section aria-labelledby="who-heading" className={sectionPadding}>
      <div className="container max-w-5xl">
        <SectionHeader
          eyebrow="Audience"
          id="who-heading"
          title="Who it’s for"
          description="Designers, developers with a coding agent, and people who need to hand off a visual change."
        />
        <p className="mt-6 text-center text-base">
          <Link href="/solutions" className="underline underline-offset-8">
            See the jobs
          </Link>
        </p>
        <ul className="mt-10 grid gap-8 text-left md:grid-cols-3">
          {audiences.map((audience) => (
            <li key={audience.title}>
              <h3 className="text-2xl font-semibold">{audience.title}</h3>
              <p className="text-muted-foreground mt-3 text-base leading-relaxed">
                {audience.text}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
