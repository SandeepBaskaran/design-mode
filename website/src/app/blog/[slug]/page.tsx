import { notFound } from "next/navigation";

import { Background } from "@/components/background";
import { DashedLine } from "@/components/dashed-line";
import {
  JsonLd,
  blogPostingSchema,
  breadcrumbSchema,
} from "@/components/site/json-ld";
import { RelatedLinks } from "@/components/site/related-links";
import { getPost, posts } from "@/content/blog";

export function generateStaticParams() {
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const p = getPost(slug);
  if (!p) return {};
  const url = `https://designmode.app/blog/${p.slug}`;
  return {
    title: p.metaTitle,
    description: p.metaDescription,
    keywords: p.keywords,
    alternates: { canonical: url },
    openGraph: {
      title: p.metaTitle,
      description: p.metaDescription,
      url,
      type: "article",
      publishedTime: p.datePublished,
      images: ["/og-image.png"],
    },
  };
}

const dateFmt = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const p = getPost(slug);
  if (!p) notFound();

  const url = `https://designmode.app/blog/${p.slug}`;

  return (
    <>
      <JsonLd
        data={blogPostingSchema({
          title: p.metaTitle,
          description: p.metaDescription,
          url,
          datePublished: p.datePublished,
        })}
      />
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", url: "https://designmode.app/" },
          { name: "Blog", url: "https://designmode.app/blog" },
          { name: p.title, url },
        ])}
      />

      <Background>
        <section className="pt-28 pb-12 lg:pt-44 lg:pb-16">
          <div className="container max-w-4xl">
            <time
              dateTime={p.datePublished}
              className="text-muted-foreground text-sm font-medium tracking-wide uppercase"
            >
              {dateFmt.format(new Date(p.datePublished))}
            </time>
            <h1 className="mt-3 text-3xl tracking-tight sm:text-4xl md:text-5xl">
              {p.title}
            </h1>
            <p className="text-muted-foreground mt-4 text-lg md:text-xl">
              {p.excerpt}
            </p>
          </div>
        </section>
      </Background>

      <section className="py-16 lg:py-20">
        <DashedLine className="container max-w-4xl" />
        <article className="container mt-12 max-w-4xl space-y-10">
          {p.body.map((block, i) => (
            <div key={i}>
              {block.heading && (
                <h2 className="text-xl tracking-tight md:text-2xl">
                  {block.heading}
                </h2>
              )}
              <div className="text-muted-foreground mt-3 space-y-4 leading-relaxed">
                {block.paragraphs.map((para, j) => (
                  <p key={j}>{para}</p>
                ))}
              </div>
            </div>
          ))}
        </article>

        <RelatedLinks
          title="Keep reading"
          links={p.related
            .map((slug) => getPost(slug))
            .filter((r): r is NonNullable<typeof r> => Boolean(r))
            .map((r) => ({
              href: `/blog/${r.slug}`,
              title: r.title,
              description: r.excerpt,
            }))}
        />
      </section>
    </>
  );
}
