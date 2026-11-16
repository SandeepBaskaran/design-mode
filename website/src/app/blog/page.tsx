import { Background } from "@/components/background";
import { DashedLine } from "@/components/dashed-line";
import { JsonLd, collectionPageSchema } from "@/components/site/json-ld";
import { LinkCard } from "@/components/site/related-links";
import { SectionHeader } from "@/components/site/section-header";
import { posts } from "@/content/blog";

export const metadata = {
  title: { absolute: "Build notes and visual editing guides | Design Mode" },
  description:
    "Stories from building Design Mode and walkthroughs of real workflows: MCP architecture, vibe coding loops, changelog deep-dives, Tailwind redesigns with Claude Code.",
  keywords: [
    "Design Mode blog",
    "vibe coding articles",
    "MCP articles",
    "Claude Code blog",
    "AI design agent",
  ],
  alternates: { canonical: "https://designmode.app/blog" },
  openGraph: {
    type: "website",
    title: "Build notes and visual editing guides | Design Mode",
    description:
      "Stories from building Design Mode and walkthroughs of real workflows: MCP architecture, vibe coding loops, changelog deep-dives, Tailwind redesigns with Claude Code.",
    url: "https://designmode.app/blog",
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
    title: "Build notes and visual editing guides | Design Mode",
    description:
      "Stories from building Design Mode and walkthroughs of real workflows: MCP architecture, vibe coding loops, changelog deep-dives, Tailwind redesigns with Claude Code.",
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

const dateFmt = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

export default function BlogIndex() {
  const sorted = [...posts].sort((a, b) =>
    b.datePublished.localeCompare(a.datePublished),
  );

  return (
    <>
      <JsonLd
        data={collectionPageSchema({
          name: "Design Mode build notes and guides",
          description:
            "Build notes and workflow guides for browser visual editing and coding-agent hand-off.",
          url: "https://designmode.app/blog",
          items: sorted.map((post) => ({
            name: post.title,
            url: `https://designmode.app/blog/${post.slug}`,
          })),
        })}
      />
      <Background>
        <section className="py-12 lg:py-16">
          <div className="container max-w-5xl">
            <SectionHeader
              as="h1"
              eyebrow="Blog"
              title="Blog"
              description="Build notes, setup guides, and release write-ups. The install and MCP guides live here."
            />
          </div>
        </section>
      </Background>

      <section className="py-16 lg:py-20">
        <DashedLine className="container max-w-5xl" />
        <div className="container mt-12 grid max-w-5xl gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sorted.map((p) => (
            <LinkCard
              key={p.slug}
              href={`/blog/${p.slug}`}
              title={p.title}
              description={p.excerpt}
              eyebrow={dateFmt.format(new Date(p.datePublished))}
            />
          ))}
        </div>
      </section>
    </>
  );
}
