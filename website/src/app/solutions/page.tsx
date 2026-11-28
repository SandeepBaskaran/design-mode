import { ArrowRight } from "lucide-react";

import { SolutionsAccordion } from "./solutions-accordion";

import { Background } from "@/components/background";
import { JsonLd, collectionPageSchema } from "@/components/site/json-ld";
import { RelatedLinks } from "@/components/site/related-links";
import { SectionHeader, sectionPadding } from "@/components/site/section-header";
import { useCases } from "@/content/use-cases";

export const metadata = {
  title: {
    absolute: "Solutions | Design Mode",
  },
  description:
    "The same loop for designers, developers and reviewers: edit a rendered page, record the exact changes, and hand them to a person or coding agent.",
  alternates: { canonical: "https://designmode.app/solutions" },
  openGraph: {
    type: "website",
    title: "Solutions | Design Mode",
    description:
      "The same loop for designers, developers and reviewers: edit a rendered page, record the exact changes, and hand them to a person or coding agent.",
    url: "https://designmode.app/solutions",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Design Mode — The visual editor for all your agent’s work",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Solutions | Design Mode",
    description:
      "The same loop for designers, developers and reviewers: edit a rendered page, record the exact changes, and hand them to a person or coding agent.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Design Mode — The visual editor for all your agent’s work",
      },
    ],
  },
};

export default function UseCasesIndex() {
  return (
    <>
      <JsonLd
        data={collectionPageSchema({
          name: "Solutions",
          description:
            "Jobs that start by editing a rendered page and handing a structured specification to a person or coding agent.",
          url: "https://designmode.app/solutions",
          items: useCases.map((item) => ({
            name: item.title,
            url: `https://designmode.app/solutions#${item.slug}`,
          })),
        })}
      />
      <Background>
        <section className={sectionPadding}>
          <div className="container max-w-5xl">
            <SectionHeader
              as="h1"
              eyebrow="Solutions"
              title="From live page to code"
              description="One loop: edit the rendered page, record the exact changes, then hand them to a coding agent or a teammate."
            />
          </div>
        </section>
      </Background>

      <section className={sectionPadding}>
        <div className="container max-w-5xl">
          <div
            className="mb-10 flex flex-col gap-3 md:flex-row md:items-stretch"
            aria-label="Design Mode workflow loop"
          >
            {[
              {
                step: "1. Edit live",
                detail: "Adjust styles, copy, layout, or pin comments on any scriptable page.",
              },
              {
                step: "2. Hand off",
                detail: "Copy as Markdown prompt, export JSON, or send over MCP.",
              },
              {
                step: "3. Review diff",
                detail: "An engineer or coding agent updates source code for you to review.",
              },
            ].map((item, index) => (
              <div key={item.step} className="flex flex-1 items-center gap-2">
                <div className="bg-card h-full w-full rounded-xl border p-4">
                  <p className="text-foreground text-base font-semibold">
                    {item.step}
                  </p>
                  <p className="text-muted-foreground mt-1 text-base leading-relaxed">
                    {item.detail}
                  </p>
                </div>
                {index < 2 && (
                  <ArrowRight
                    aria-hidden="true"
                    className="text-muted-foreground hidden size-4 shrink-0 md:block"
                  />
                )}
              </div>
            ))}
          </div>
          <SolutionsAccordion />
        </div>
      </section>

      <RelatedLinks
        title="Guides"
        links={[
          {
            href: "/blog/browser-support",
            title: "Install and browser support",
            description: "Chrome, Firefox and Safari, and what differs between them.",
          },
          {
            href: "/blog/mcp-setup",
            title: "Connect an agent",
            description: "Cloud, Local and Self-hosted MCP setup.",
          },
          {
            href: "/blog/changes-tab",
            title: "Changes tab",
            description: "Review, export and copy the recorded edits.",
          },
          {
            href: "/blog/keyboard-shortcuts",
            title: "Keyboard shortcuts",
            description: "The in-page keys and the two browser commands.",
          },
          {
            href: "/blog/troubleshooting",
            title: "Troubleshooting",
            description: "Panel will not open, MCP stays offline, edits do not stick.",
          },
        ]}
      />
    </>
  );
}
