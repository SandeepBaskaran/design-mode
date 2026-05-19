import React from "react";

import Link from "next/link";

import { Github, Heart, Mail, MessageCircle, Twitter } from "lucide-react";

import { DashedLine } from "@/components/dashed-line";

const REPO_URL = "https://github.com/SandeepBaskaran/design-mode";
const X_URL = "https://x.com/sandeepbaskaran";
const SPONSORS_URL = "https://github.com/sponsors/SandeepBaskaran";
const EMAIL = "hello@sandeepbaskaran.com";

const contactInfo = [
  {
    title: "Email",
    content: (
      <div className="mt-3">
        <Link
          href={`mailto:${EMAIL}`}
          className="text-muted-foreground hover:text-foreground"
        >
          {EMAIL}
        </Link>
        <p className="text-muted-foreground mt-1 text-sm">
          Best for security disclosures, partnerships, and anything off the record.
        </p>
      </div>
    ),
  },
  {
    title: "GitHub",
    content: (
      <div className="mt-3 space-y-1">
        <Link
          href={`${REPO_URL}/issues/new/choose`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground block"
        >
          File an issue ↗
        </Link>
        <Link
          href={`${REPO_URL}/discussions`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground block"
        >
          Start a discussion ↗
        </Link>
        <Link
          href={`${REPO_URL}/compare`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground block"
        >
          Open a pull request ↗
        </Link>
      </div>
    ),
  },
  {
    title: "Follow / Support",
    content: (
      <div className="mt-3 flex gap-6 lg:gap-8">
        <Link
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground"
          aria-label="GitHub repository"
        >
          <Github className="size-5" />
        </Link>
        <Link
          href={X_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground"
          aria-label="X (Twitter)"
        >
          <Twitter className="size-5" />
        </Link>
        <Link
          href={SPONSORS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground"
          aria-label="GitHub Sponsors"
        >
          <Heart className="size-5" />
        </Link>
      </div>
    ),
  },
];

export default function Contact() {
  return (
    <section className="py-28 lg:py-32 lg:pt-44">
      <div className="container max-w-2xl">
        <h1 className="text-center text-2xl font-semibold tracking-tight md:text-4xl lg:text-5xl">
          Get in touch
        </h1>
        <p className="text-muted-foreground mt-4 text-center leading-snug font-medium lg:mx-auto">
          Bug? Feature idea? Sponsorship question? Pick the channel that fits.
        </p>

        <div className="mt-10 flex justify-between gap-8 max-sm:flex-col md:mt-14 lg:mt-20 lg:gap-12">
          {contactInfo.map((info, index) => (
            <div key={index}>
              <h2 className="font-medium">{info.title}</h2>
              {info.content}
            </div>
          ))}
        </div>

        <DashedLine className="my-12" />

        <div className="mx-auto space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <MessageCircle className="size-5" /> Where bug reports go
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            For reproducible bugs, the issue template is the right place. Open
            the Help panel inside the side panel (the <span className="font-mono text-sm">?</span>{" "}
            icon next to the gear), click <span className="font-mono text-sm">Copy diagnostics</span>,
            paste that into the issue, and you've handed us 80% of what we need
            to investigate.
          </p>
          <h2 className="mt-8 flex items-center gap-2 text-lg font-semibold">
            <Mail className="size-5" /> Security
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Please don't file security reports as public issues. Email{" "}
            <Link
              href={`mailto:${EMAIL}`}
              className="underline underline-offset-4"
            >
              {EMAIL}
            </Link>{" "}
            with the details — full disclosure policy lives in{" "}
            <Link
              href={`${REPO_URL}/blob/main/SECURITY.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              SECURITY.md
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
