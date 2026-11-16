import Link from "next/link";

import { SectionHeader } from "@/components/site/section-header";
import { withNavRef } from "@/lib/nav-ref";

const REPO_URL = withNavRef("https://github.com/SandeepBaskaran/design-mode");
const EMAIL = "hello@sandeepbaskaran.com";

export function HomeAbout() {
  return (
    <section id="about" aria-labelledby="about-heading" className="py-16 md:py-24">
      <div className="container max-w-5xl">
        <SectionHeader
          eyebrow="Project"
          id="about-heading"
          title="About"
          description="Sandeep Baskaran builds Design Mode in the open. The extension records a preview; the source change is reviewed separately."
        />
        <div className="text-muted-foreground mt-6 max-w-3xl space-y-4 text-base leading-relaxed">
          <p>
            Sandeep Baskaran is a Senior UX Designer in Bengaluru, working in
            IBM&apos;s Z Infrastructure organisation. Design Mode is his
            independent, MIT-licensed browser extension.
          </p>
          <p>
            Screenshots lose selectors and computed values. Design Mode records
            the change on the rendered page and hands it over as Markdown or
            through MCP. The agent still implements the source, and you review
            the diff.
          </p>
        </div>
        <p className="mt-6 text-base">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-8"
          >
            View the source
          </a>
        </p>
      </div>
    </section>
  );
}

export function HomeContact() {
  return (
    <section
      id="contact"
      aria-labelledby="contact-heading"
      className="pb-16 md:pb-24"
    >
      <div className="container max-w-5xl">
        <SectionHeader
          eyebrow="Support"
          id="contact-heading"
          title="Contact"
          description="Email for private notes. GitHub for bugs and ideas. Security reports stay out of public issues."
        />
        <ul className="mt-6 max-w-3xl space-y-3 text-base">
          <li>
            <a className="underline underline-offset-4" href={`mailto:${EMAIL}`}>
              {EMAIL}
            </a>
            <span className="text-muted-foreground">
              {" "}
              — security, partnerships, and anything off the record.
            </span>
          </li>
          <li>
            <a
              className="underline underline-offset-4"
              href={withNavRef(
                "https://github.com/SandeepBaskaran/design-mode/issues/new/choose",
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub issues
            </a>
            <span className="text-muted-foreground">
              {" "}
              — bugs and feature ideas. Copy diagnostics from Help in the
              extension first.
            </span>
          </li>
          <li className="text-muted-foreground">
            Do not file security reports as public issues. Email the address
            above, and read{" "}
            <Link
              href={withNavRef(
                "https://github.com/SandeepBaskaran/design-mode/blob/main/SECURITY.md",
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              SECURITY.md
            </Link>
            .
          </li>
        </ul>
      </div>
    </section>
  );
}
