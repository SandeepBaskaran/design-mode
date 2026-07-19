import Link from "next/link";

import { Button } from "@/components/ui/button";

const REPO_URL = "https://github.com/SandeepBaskaran/design-mode";

// Exported separately so the page can wrap it in <Background variant="bottom">.
export function WhyThisExists() {
  return (
    <section className="container max-w-5xl">
      <TextSection
        title="Why this exists"
        paragraphs={[
          "Most design-to-code workflows look like this: open a mock, take a screenshot, paste it into an agent, then hope it guesses your CSS correctly. It works often enough that we tolerate it, but the round-trip is brutal — and the agent never sees the real page state.",
          "Design Mode skips the mocking step. You inspect a real element on a real page in your real browser, change it visually, and send the exact diff to your agent over MCP. The agent gets ground truth instead of a guess.",
          "Built in the open under MIT. Read the source, file an issue, or open a PR.",
        ]}
        ctaButton={{
          href: REPO_URL,
          text: "View on GitHub",
          external: true,
        }}
      />
    </section>
  );
}

interface TextSectionProps {
  title?: string;
  paragraphs: string[];
  ctaButton?: {
    href: string;
    text: string;
    external?: boolean;
  };
}

export function TextSection({
  title,
  paragraphs,
  ctaButton,
}: TextSectionProps) {
  return (
    <section className="flex-1 space-y-4 text-lg md:space-y-6">
      {title && (
        <h2 className="text-foreground text-2xl tracking-tight md:text-3xl">
          {title}
        </h2>
      )}
      <div className="text-muted-foreground max-w-3xl space-y-6">
        {paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
      {ctaButton &&
        (ctaButton.external ? (
          <div className="mt-8">
            <a
              href={ctaButton.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="lg">{ctaButton.text}</Button>
            </a>
          </div>
        ) : (
          <div className="mt-8">
            <Link href={ctaButton.href}>
              <Button size="lg">{ctaButton.text}</Button>
            </Link>
          </div>
        ))}
    </section>
  );
}
