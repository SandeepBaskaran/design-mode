import Link from "next/link";
import { notFound } from "next/navigation";

import { Check } from "lucide-react";

import { Background } from "@/components/background";
import { DashedLine } from "@/components/dashed-line";
import {
  JsonLd,
  articleSchema,
  breadcrumbSchema,
} from "@/components/site/json-ld";
import { RelatedLinks } from "@/components/site/related-links";
import { Button } from "@/components/ui/button";
import { comparisons, getComparison } from "@/content/comparisons";

export function generateStaticParams() {
  return comparisons.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const c = getComparison(slug);
  if (!c) return {};
  const url = `https://designmode.app/compare/${c.slug}`;
  return {
    title: c.metaTitle,
    description: c.metaDescription,
    keywords: c.keywords,
    alternates: { canonical: url },
    openGraph: {
      title: c.metaTitle,
      description: c.metaDescription,
      url,
      type: "article",
      images: ["/og-image.png"],
    },
  };
}

export default async function ComparePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const c = getComparison(slug);
  if (!c) notFound();

  const url = `https://designmode.app/compare/${c.slug}`;

  return (
    <>
      <JsonLd
        data={articleSchema({
          title: c.metaTitle,
          description: c.metaDescription,
          url,
          datePublished: "2026-05-24",
        })}
      />
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", url: "https://designmode.app/" },
          { name: "Comparisons", url: "https://designmode.app/compare" },
          { name: c.title, url },
        ])}
      />

      <Background>
        <section className="py-28 lg:py-32 lg:pt-44">
          <div className="container max-w-4xl">
            <h1 className="text-3xl tracking-tight sm:text-4xl md:text-5xl">
              {c.title}
            </h1>
            <p className="text-muted-foreground mt-4 text-lg md:text-xl">
              {c.oneLiner}
            </p>
          </div>
        </section>
      </Background>

      <section className="py-16 lg:py-20">
        <DashedLine className="container max-w-4xl" />
        <article className="container mt-12 max-w-4xl space-y-12">
          <div>
            <h2 className="text-2xl tracking-tight md:text-3xl">
              How they compare
            </h2>
            <p className="text-muted-foreground mt-4 leading-relaxed">
              {c.positioning}
            </p>
          </div>

          <div>
            <h2 className="text-2xl tracking-tight md:text-3xl">
              Feature-by-feature
            </h2>
            <div className="mt-6 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-muted-foreground w-1/3 py-3 pr-4 text-left font-semibold">
                      Feature
                    </th>
                    <th className="text-foreground py-3 pr-4 text-left font-semibold">
                      Design Mode
                    </th>
                    <th className="text-foreground py-3 text-left font-semibold">
                      {c.competitor}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {c.table.map((row, i) => (
                    <tr key={i} className="border-b align-top">
                      <td className="text-muted-foreground py-3 pr-4 font-medium">
                        {row.feature}
                      </td>
                      <td className="text-foreground py-3 pr-4 leading-relaxed">
                        {row.designMode}
                      </td>
                      <td className="text-foreground py-3 leading-relaxed">
                        {row.competitor}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <h2 className="text-xl tracking-tight md:text-2xl">
                When to pick Design Mode
              </h2>
              <ul className="mt-4 space-y-2">
                {c.whenToPickDesignMode.map((item, i) => (
                  <li
                    key={i}
                    className="text-muted-foreground flex gap-2 text-sm leading-relaxed"
                  >
                    <Check className="text-foreground mt-1 size-4 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-xl tracking-tight md:text-2xl">
                When to pick {c.competitor}
              </h2>
              <ul className="mt-4 space-y-2">
                {c.whenToPickCompetitor.map((item, i) => (
                  <li
                    key={i}
                    className="text-muted-foreground flex gap-2 text-sm leading-relaxed"
                  >
                    <Check className="text-foreground mt-1 size-4 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div>
            <h2 className="text-2xl tracking-tight md:text-3xl">
              Honest take
            </h2>
            <p className="text-muted-foreground mt-4 leading-relaxed">
              {c.honesty}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-4">
            <Button asChild>
              <Link href="/demo">Try Design Mode</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/use-cases">See use cases</Link>
            </Button>
          </div>
        </article>

        <RelatedLinks
          title="More comparisons"
          links={c.related
            .map((slug) => getComparison(slug))
            .filter((r): r is NonNullable<typeof r> => Boolean(r))
            .map((r) => ({
              href: `/compare/${r.slug}`,
              title: r.title,
              description: r.oneLiner,
            }))}
        />
      </section>
    </>
  );
}
