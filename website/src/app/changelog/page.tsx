import Link from "next/link";

import { ArrowUpRight } from "lucide-react";

import { Background } from "@/components/background";
import { DashedLine } from "@/components/dashed-line";
import { releases } from "@/content/changelog";

const REPO_CHANGELOG =
  "https://github.com/SandeepBaskaran/design-mode/blob/main/CHANGELOG.md";

export const metadata = {
  title: "Changelog — every Design Mode feature, and when it shipped",
  description:
    "A plain-language, dated log of every Design Mode feature — corner shapes, responsive edit tags, design-system tokens, motion, measure & resize, Firefox support, and more — so you can see exactly when each capability became available.",
  keywords: [
    "Design Mode changelog",
    "Design Mode release notes",
    "Design Mode features by version",
    "Design Mode version history",
    "when was Design Mode feature added",
  ],
  alternates: { canonical: "https://designmode.app/changelog" },
  openGraph: {
    title: "Changelog — Design Mode",
    description:
      "Every Design Mode feature, in plain language, with the date it shipped.",
    url: "https://designmode.app/changelog",
    images: ["/og-image.png"],
  },
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Format an ISO YYYY-MM-DD without going through Date() — avoids any
// server/client timezone drift on a static page.
function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export default function ChangelogPage() {
  return (
    <>
      <Background>
        <section className="pt-28 pb-12 lg:pt-44 lg:pb-16">
          <div className="container max-w-3xl">
            <h1 className="text-3xl tracking-tight sm:text-4xl md:text-5xl">
              Changelog
            </h1>
            <p className="text-muted-foreground mt-4 max-w-2xl text-lg md:text-xl">
              Every Design Mode feature in plain language, with the date it
              shipped — so you always know what you can do, and since when.
            </p>
            <p className="text-muted-foreground mt-3 text-sm">
              Want the technical detail?{" "}
              <a
                href={REPO_CHANGELOG}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground/80 inline-flex items-center gap-1 font-medium underline underline-offset-4"
              >
                Full CHANGELOG on GitHub
                <ArrowUpRight className="size-3.5" />
              </a>
            </p>
          </div>
        </section>
      </Background>

      <section className="pb-20 lg:pb-28">
        <DashedLine className="container max-w-3xl" />
        <div className="container mt-12 max-w-3xl">
          <ol className="flex flex-col gap-14">
            {releases.map((r) => (
              <li key={r.version} id={`v${r.version}`} className="scroll-mt-28">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="font-display text-xl font-semibold tracking-tight">
                    <span className="bg-secondary text-secondary-foreground rounded-full px-2.5 py-0.5 text-sm font-medium">
                      v{r.version}
                    </span>
                  </h2>
                  <time
                    dateTime={r.date}
                    className="text-muted-foreground text-sm"
                  >
                    {formatDate(r.date)}
                  </time>
                </div>
                <p className="text-foreground mt-3 font-medium">{r.headline}</p>
                <ul className="mt-3 flex flex-col gap-2.5">
                  {r.highlights.map((h, i) => (
                    <li
                      key={i}
                      className="text-muted-foreground flex gap-2.5 text-[15px] leading-relaxed"
                    >
                      <span
                        aria-hidden
                        className="bg-primary/60 mt-2 size-1.5 shrink-0 rounded-full"
                      />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>

          <p className="text-muted-foreground mt-16 border-t pt-8 text-sm">
            Design Mode is free and open source.{" "}
            <Link
              href="/demo"
              className="text-foreground/80 font-medium underline underline-offset-4"
            >
              Try it yourself
            </Link>{" "}
            or{" "}
            <Link
              href="/features"
              className="text-foreground/80 font-medium underline underline-offset-4"
            >
              browse the full feature set
            </Link>
            .
          </p>
        </div>
      </section>
    </>
  );
}
