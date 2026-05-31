import { notFound } from "next/navigation";

import { Background } from "@/components/background";
import { DashedLine } from "@/components/dashed-line";
import {
  JsonLd,
  articleSchema,
  breadcrumbSchema,
  howToSchema,
} from "@/components/site/json-ld";
import { RelatedLinks } from "@/components/site/related-links";
import { docs, getDoc } from "@/content/docs";

export function generateStaticParams() {
  return docs.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const d = getDoc(slug);
  if (!d) return {};
  const url = `https://designmode.app/docs/${d.slug}`;
  return {
    title: d.metaTitle,
    description: d.metaDescription,
    keywords: d.keywords,
    alternates: { canonical: url },
    openGraph: {
      title: d.metaTitle,
      description: d.metaDescription,
      url,
      type: "article",
      images: ["/og-image.png"],
    },
  };
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const d = getDoc(slug);
  if (!d) notFound();

  const url = `https://designmode.app/docs/${d.slug}`;

  return (
    <>
      <JsonLd
        data={articleSchema({
          title: d.metaTitle,
          description: d.metaDescription,
          url,
          datePublished: "2026-05-24",
        })}
      />
      <JsonLd
        data={howToSchema({
          name: d.title,
          description: d.intro,
          url,
          steps: d.sections.map((s) => ({ name: s.heading, text: s.body })),
        })}
      />
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", url: "https://designmode.app/" },
          { name: "Docs", url: "https://designmode.app/docs" },
          { name: d.title, url },
        ])}
      />

      <Background>
        <section className="pt-28 pb-12 lg:pt-44 lg:pb-16">
          <div className="container max-w-4xl">
            <h1 className="text-3xl tracking-tight sm:text-4xl md:text-5xl">
              {d.title}
            </h1>
            <p className="text-muted-foreground mt-4 text-lg md:text-xl">
              {d.intro}
            </p>
          </div>
        </section>
      </Background>

      <section className="py-16 lg:py-20">
        <DashedLine className="container max-w-4xl" />
        <article className="container mt-12 max-w-4xl space-y-10">
          {d.sections.map((s, i) => (
            <div key={i}>
              <h2 className="text-xl tracking-tight md:text-2xl">
                {s.heading}
              </h2>
              <p className="text-muted-foreground mt-3 leading-relaxed">
                {s.body}
              </p>
              {s.code && (
                <pre className="bg-muted text-foreground mt-4 overflow-x-auto rounded-lg border p-4 text-xs leading-relaxed">
                  <code>{s.code}</code>
                </pre>
              )}
            </div>
          ))}
        </article>

        <RelatedLinks
          title="Related docs"
          links={d.related
            .map((slug) => getDoc(slug))
            .filter((r): r is NonNullable<typeof r> => Boolean(r))
            .map((r) => ({
              href: `/docs/${r.slug}`,
              title: r.title,
              description: r.intro,
            }))}
        />
      </section>
    </>
  );
}
