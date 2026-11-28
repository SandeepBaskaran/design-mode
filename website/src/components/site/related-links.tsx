import Link from "next/link";

import { ArrowUpRight } from "lucide-react";

import { sectionGap, sectionPadding } from "@/components/site/section-header";

export type RelatedLink = {
  href: string;
  title: string;
  description?: string;
  eyebrow?: string;
};

export function LinkCard({
  href,
  title,
  description,
  eyebrow,
}: RelatedLink) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col rounded-2xl border p-6 transition-shadow hover:shadow-md"
    >
      {eyebrow && (
        <p className="text-muted-foreground text-base font-medium tracking-wide uppercase">
          {eyebrow}
        </p>
      )}
      <div
        className={
          eyebrow
            ? "mt-2 flex items-start justify-between gap-4"
            : "flex items-start justify-between gap-4"
        }
      >
        <h3 className="font-display text-base font-semibold">{title}</h3>
        <ArrowUpRight className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
      {description && (
        <p className="text-muted-foreground mt-2 text-base leading-relaxed">
          {description}
        </p>
      )}
    </Link>
  );
}

export function RelatedLinks({
  title = "Keep reading",
  links,
}: {
  title?: string;
  links: RelatedLink[];
}) {
  if (!links.length) return null;
  return (
    <section className={sectionPadding}>
      <div className="container max-w-5xl">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
          {title}
        </h2>
        <div className={`grid gap-4 md:grid-cols-2 lg:grid-cols-3 ${sectionGap}`}>
          {links.map((link) => (
            <LinkCard key={link.href} {...link} />
          ))}
        </div>
      </div>
    </section>
  );
}
