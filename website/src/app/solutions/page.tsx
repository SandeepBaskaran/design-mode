import { Background } from "@/components/background";
import { DashedLine } from "@/components/dashed-line";
import { JsonLd, collectionPageSchema } from "@/components/site/json-ld";
import { RelatedLinks } from "@/components/site/related-links";
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
        <section className="py-12 lg:py-16">
          <div className="container max-w-5xl">
            <h1 className="text-3xl tracking-tight sm:text-4xl md:text-5xl">
              Solutions
            </h1>
            <p className="text-muted-foreground mt-4 max-w-3xl text-base">
              One loop: edit the rendered page, record the exact changes, then
              hand them to a coding agent or a teammate who can update the
              source.
            </p>
            <ul className="mt-8 max-w-3xl space-y-3 text-base">
              <li>Designers and design engineers working on a live page.</li>
              <li>
                Developers using Claude Code, Cursor or another compatible
                agent.
              </li>
              <li>
                QA, content and product people exporting visual feedback
                without writing the code.
              </li>
            </ul>
          </div>
        </section>
      </Background>

      <section className="py-16 lg:py-20">
        <DashedLine className="container max-w-5xl" />
        <div className="container mt-12 grid max-w-5xl gap-6 md:grid-cols-2">
          {useCases.map((item) => (
            <article
              key={item.slug}
              id={item.slug}
              className="scroll-mt-24 rounded-2xl border p-6"
            >
              <p className="text-muted-foreground text-base font-medium tracking-wide uppercase">
                {item.persona}
              </p>
              <h2 className="font-display mt-2 text-2xl leading-snug font-semibold">
                {item.title}
              </h2>
              <p className="text-muted-foreground mt-2 text-base leading-relaxed">
                {item.summary}
              </p>
            </article>
          ))}
        </div>
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
      </section>
    </>
  );
}
