import Link from "next/link";

import { Background } from "@/components/background";
import { FAQItems } from "@/components/blocks/faq";
import { DashedLine } from "@/components/dashed-line";
import { JsonLd, faqSchema } from "@/components/site/json-ld";
import { RelatedLinks } from "@/components/site/related-links";
import { faqGroups } from "@/content/product-facts";

export const metadata = {
  title: { absolute: "Design Mode FAQ — Browser editing, MCP and privacy" },
  description:
    "How Design Mode edits a rendered webpage, sends changes to coding agents, supports Chrome, Firefox and Safari on Mac, and handles storage and Cloud relay data.",
  alternates: { canonical: "https://designmode.app/faq" },
  openGraph: {
    type: "website",
    title: "Design Mode FAQ — Browser editing, MCP and privacy",
    description:
      "How Design Mode edits a rendered webpage, sends changes to coding agents, supports Chrome, Firefox and Safari on Mac, and handles storage and Cloud relay data.",
    url: "https://designmode.app/faq",
    images: [
      {
        url: "/og-design-mode-inter-v3.png",
        width: 1200,
        height: 630,
        alt: "Design Mode — The visual editor for all your agent’s work",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Design Mode FAQ — Browser editing, MCP and privacy",
    description:
      "How Design Mode edits a rendered webpage, sends changes to coding agents, supports Chrome, Firefox and Safari on Mac, and handles storage and Cloud relay data.",
    images: [
      {
        url: "/og-design-mode-inter-v3.png",
        width: 1200,
        height: 630,
        alt: "Design Mode — The visual editor for all your agent’s work",
      },
    ],
  },
};

const flatQA = faqGroups.flatMap((group) => group.items);

export default function FaqPage() {
  return (
    <>
      <JsonLd data={faqSchema(flatQA)} />
      <Background>
        <section className="py-12 lg:py-16">
          <div className="container max-w-5xl">
            <h1 className="text-3xl tracking-tight sm:text-4xl md:text-5xl">
              Frequently asked questions
            </h1>
            <p className="text-muted-foreground mt-4 max-w-3xl text-base leading-relaxed">
              Direct answers about browser editing, source-code hand-off, MCP,
              storage and privacy. For setup steps, use the{" "}
              <Link
                href="/docs"
                className="text-foreground underline underline-offset-8"
              >
                documentation
              </Link>
              .
            </p>
          </div>
        </section>
      </Background>

      <section className="py-16 lg:py-20">
        <DashedLine className="container max-w-5xl" />
        <div className="container mt-12 max-w-5xl space-y-12">
          {faqGroups.map((group, groupIndex) => (
            <section
              key={group.title}
              aria-labelledby={`faq-group-${groupIndex}`}
            >
              <h2
                id={`faq-group-${groupIndex}`}
                className="text-foreground border-b pb-4 text-2xl font-semibold tracking-tight md:text-3xl"
              >
                {group.title}
              </h2>
              <div className="mt-2 w-full">
                <FAQItems
                  items={group.items}
                  name={`faq-group-${groupIndex}`}
                />
              </div>
            </section>
          ))}
        </div>

        <RelatedLinks
          title="Continue"
          links={[
            {
              href: "/mcp",
              title: "How the agent hand-off works",
              description: "Choose Copy as Prompt or connect an MCP client.",
            },
            {
              href: "/docs/browser-support",
              title: "Chrome, Firefox and Safari support",
              description:
                "Store installs, the Safari Web Inspector zip, and browser-specific limits.",
            },
            {
              href: "/privacy",
              title: "Privacy details",
              description:
                "Storage, relay retention, operational logs and website analytics.",
            },
            {
              href: "/docs/mcp-setup",
              title: "MCP setup",
              description:
                "Client-specific configuration and verification steps.",
            },
          ]}
        />
      </section>
    </>
  );
}
