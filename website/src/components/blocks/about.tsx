import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const REPO_URL = "https://github.com/SandeepBaskaran/design-mode";

const About = () => {
  return (
    <section className="container mt-10 flex max-w-5xl flex-col gap-12 md:mt-14 md:gap-14 lg:mt-20 lg:gap-20">
      <div className="flex flex-col gap-8 lg:gap-16 xl:gap-20">
        <ImageSection
          images={[
            { src: "/about/1.webp", alt: "Live design editing on a real page" },
            { src: "/about/2.webp", alt: "Side panel with design controls" },
          ]}
          className="xl:-translate-x-10"
        />

        <TextSection
          paragraphs={[
            "Privacy is not a feature on the roadmap — it's the default. The extension stores edits in chrome.storage locally. The optional MCP server runs on localhost. The hosted cloud relay is opt-in, self-hostable, and drops payload bodies within ~60 seconds.",
            "No accounts. No telemetry by default. No paywalls. The Contribute panel inside the side panel has ways to help if you find it useful — but they are all optional. The default state of using Design Mode is: download, install, design.",
          ]}
        />
      </div>

      <div className="flex flex-col gap-8 lg:gap-16 xl:gap-20">
        <ImageSection
          images={[
            { src: "/about/3.webp", alt: "Editing live page" },
            { src: "/about/4.webp", alt: "Sending diff to coding agent" },
          ]}
          className="hidden lg:flex xl:translate-x-10"
        />
      </div>
    </section>
  );
};

export default About;

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

interface ImageSectionProps {
  images: { src: string; alt: string }[];
  className?: string;
}

export function ImageSection({ images, className }: ImageSectionProps) {
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {images.map((image, index) => (
        <div
          key={index}
          className="relative aspect-[2/1.5] overflow-hidden rounded-2xl"
        >
          <Image
            src={image.src}
            alt={image.alt}
            fill
            className="object-cover"
          />
        </div>
      ))}
    </div>
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
      {title && <h2 className="text-foreground text-4xl">{title}</h2>}
      <div className="text-muted-foreground max-w-xl space-y-6">
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
