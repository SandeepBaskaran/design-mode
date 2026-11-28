import { ClipboardList, Code2, Palette } from "lucide-react";

import { Background } from "@/components/background";
import { JsonLd, collectionPageSchema } from "@/components/site/json-ld";
import { RelatedLinks } from "@/components/site/related-links";
import { SectionHeader, sectionPadding } from "@/components/site/section-header";
import { useCases } from "@/content/use-cases";

const useCaseBySlug = new Map(useCases.map((item) => [item.slug, item]));

const buckets = [
  {
    title: "Designers & design engineers",
    example: "Example: A designer tweaks spacing on a live staging page and exports the diff.",
    icon: Palette,
    slugs: [
      "redesign-any-website",
      "design-review-in-production",
      "figma-to-code-without-figma",
      "accessibility-quick-fixes",
      "landing-page-iteration-for-indie-hackers",
      "design-system-audit",
    ],
  },
  {
    title: "Developers",
    example: "Example: A developer adjusts a component in the browser and sends it to Claude Code or Cursor.",
    icon: Code2,
    slugs: [
      "vibe-coding-with-claude-code",
      "visual-editing-with-cursor",
      "tailwind-component-tuning",
    ],
  },
  {
    title: "QA, content & product",
    example: "Example: A PM or QA tester pins a comment and files a visual bug diff for engineering.",
    icon: ClipboardList,
    slugs: [
      "ui-testing-export-to-developers",
      "bug-report-with-visual-diff",
      "copy-edits-without-a-pr",
      "client-handoff-from-agency-to-engineering",
    ],
  },
];

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
            className="grid grid-cols-1 overflow-hidden rounded-xl border md:grid-cols-3"
            aria-label="Design Mode solutions by role"
          >
            {buckets.map((bucket, bucketIndex) => {
              const Icon = bucket.icon;
              const items = bucket.slugs
                .map((slug) => useCaseBySlug.get(slug))
                .filter((item): item is NonNullable<typeof item> => Boolean(item));

              return (
                <div
                  key={bucket.title}
                  className={`flex flex-col ${
                    bucketIndex < buckets.length - 1 ? "border-b md:border-r md:border-b-0" : ""
                  }`}
                >
                  <div className="bg-muted/40 border-b p-5">
                    <Icon aria-hidden="true" className="text-primary size-6 stroke-[1.5]" />
                    <h2 className="text-foreground mt-3 text-xl font-semibold">
                      {bucket.title}
                    </h2>
                    <p className="text-muted-foreground mt-1.5 text-base leading-relaxed">
                      {bucket.example}
                    </p>
                  </div>
                  <div className="divide-y">
                    {items.map((item) => (
                      <div
                        key={item.slug}
                        id={item.slug}
                        className="scroll-mt-24 p-5"
                      >
                        <h3 className="text-foreground text-base font-semibold">
                          {item.title}
                        </h3>
                        <p className="text-muted-foreground mt-1.5 text-base leading-relaxed">
                          {item.summary}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
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
