import React from "react";

import Link from "next/link";

import { Mail, MessageCircle } from "lucide-react";

const REPO_URL = "https://github.com/SandeepBaskaran/design-mode";
const EMAIL = "hello@sandeepbaskaran.com";

export function ContactHero() {
  return (
    <div className="container max-w-5xl">
      <h1 className="text-3xl tracking-tight sm:text-4xl md:text-5xl">
        Get in touch
      </h1>
      <p className="text-muted-foreground mt-4 max-w-3xl text-lg md:text-xl">
        Bug? Feature idea? Sponsorship question? Pick the channel that
        fits — email for off-the-record, GitHub for everything else.
      </p>
    </div>
  );
}

export function ContactChannels() {
  return (
    <div className="container max-w-5xl pl-[152px]">
      <div className="grid gap-12 md:grid-cols-2 md:gap-16">
        <div>
          <h2 className="text-foreground font-medium">Email</h2>
          <div className="mt-3">
            <Link
              href={`mailto:${EMAIL}`}
              className="text-muted-foreground hover:text-foreground"
            >
              {EMAIL}
            </Link>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              Best for security disclosures, partnerships, and anything
              off the record.
            </p>
          </div>
        </div>

        <div>
          <h2 className="text-foreground font-medium">GitHub</h2>
          <div className="mt-3 space-y-2">
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
        </div>
      </div>
    </div>
  );
}

export function ContactReports() {
  return (
    <div className="container max-w-3xl space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <MessageCircle className="size-5" /> Where bug reports go
      </h2>
      <p className="text-muted-foreground leading-relaxed">
        For reproducible bugs, the issue template is the right place.
        Open the Help panel inside the side panel (the{" "}
        <span className="font-mono text-sm">?</span> icon next to the
        gear), click{" "}
        <span className="font-mono text-sm">Copy diagnostics</span>,
        paste that into the issue, and you've handed us 80% of what we
        need to investigate.
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
  );
}
