import Image from "next/image";

import { ArrowDownUp, Copy, Send, Terminal } from "lucide-react";

import {
  CHROME_WEB_STORE_URL,
  FIREFOX_AMO_URL,
  SAFARI_RELEASE_URL,
} from "@/lib/install-links";
import { SectionHeader, sectionGap, sectionPadding } from "@/components/site/section-header";
import { withNavRef } from "@/lib/nav-ref";

const installs = [
  {
    name: "Chrome",
    href: withNavRef(CHROME_WEB_STORE_URL),
    detail: "Chrome Web Store",
  },
  {
    name: "Firefox",
    href: withNavRef(FIREFOX_AMO_URL),
    detail: "Firefox Add-ons",
  },
  {
    name: "Safari",
    href: SAFARI_RELEASE_URL,
    detail: "Latest GitHub release, then a manual setup",
  },
];

function McpLogo() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 600 600"
      fill="currentColor"
      aria-hidden="true"
      className="size-10"
    >
      <path d="M392.2 58.6a64.7 64.7 0 0 0-90.2 0l-240.7 236a21.6 21.6 0 0 1-30 0 20.6 20.6 0 0 1 0-29.5L271.8 29a108 108 0 0 1 150.4 0 103 103 0 0 1 30 88.5 108 108 0 0 1 90.3 29.5l1.3 1.2a103 103 0 0 1 0 147.5L326.2 509.3a7 7 0 0 0 0 9.8l44.7 43.8a20.6 20.6 0 0 1 0 29.5 21.6 21.6 0 0 1-30 0L296 548.6a48 48 0 0 1 0-68.8l217.7-213.5a62 62 0 0 0 0-88.5l-1.3-1.2a64.7 64.7 0 0 0-90.1-.1L243 352.3l-.1.1-2.4 2.4a21.6 21.6 0 0 1-30.1 0 20.6 20.6 0 0 1 0-29.5L392.3 147a62 62 0 0 0-.1-88.4" />
      <path d="M362.1 117.6a20.6 20.6 0 0 0 0-29.5 21.6 21.6 0 0 0-30 0L154 262.6a103 103 0 0 0 0 147.5 108 108 0 0 0 150.4 0l178-174.5a20.6 20.6 0 0 0 0-29.5 21.6 21.6 0 0 0-30.2 0l-178 174.5a64.7 64.7 0 0 1-90.2 0 62 62 0 0 1 0-88.5z" />
    </svg>
  );
}

export function BrowserHandoff() {
  return (
    <section className={sectionPadding} aria-labelledby="browser-handoff-heading">
      <div className="container max-w-5xl">
        <SectionHeader
          eyebrow="Handoff"
          id="browser-handoff-heading"
          title="Start in your browser. Take the details wherever you work."
          description="Install it, keep the edits portable, then copy a prompt, send them, or connect an agent."
        />
        <div className={`grid gap-x-24 gap-y-16 md:grid-cols-2 ${sectionGap}`}>
          <article>
            <div
              className="flex h-10 items-center gap-4"
              aria-label="Chrome, Firefox and Safari"
            >
              <Image
                src="/chrome.svg"
                alt="Chrome"
                width={32}
                height={32}
                unoptimized
              />
              <Image
                src="/firefox.svg"
                alt="Firefox"
                width={32}
                height={32}
                unoptimized
              />
              <Image
                src="/safari.svg"
                alt="Safari"
                width={32}
                height={32}
                unoptimized
              />
            </div>
            <h3 className="mt-6 text-2xl font-semibold">Add to your browser</h3>
            <ul className="mt-4 space-y-2 text-base">
              {installs.map((install) => (
                <li key={install.name}>
                  <a
                    href={install.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4"
                  >
                    {install.name}
                  </a>
                  <span className="text-muted-foreground">
                    {" "}
                    — {install.detail}
                  </span>
                </li>
              ))}
            </ul>
          </article>
          <article>
            <ArrowDownUp aria-hidden="true" className="size-10" />
            <h3 className="mt-6 text-2xl font-semibold">
              Keep your changes portable
            </h3>
            <p className="text-muted-foreground mt-4 text-base leading-relaxed">
              Export edits as JSON.
              <br />
              Import replaces current changes.
            </p>
          </article>
          <article>
            <Copy aria-hidden="true" className="size-10" />
            <h3 className="mt-6 text-2xl font-semibold">
              Copy a prompt, not a guess
            </h3>
            <p className="text-muted-foreground mt-4 text-base leading-relaxed">
              Copy edits as an AI prompt.
              <br />
              No MCP connection needed.
            </p>
          </article>
          <article>
            <Send aria-hidden="true" className="size-10" />
            <h3 className="mt-6 text-2xl font-semibold">Send to agent</h3>
            <p className="text-muted-foreground mt-4 text-base leading-relaxed">
              Marks this session ready for a connected agent.
              <br />
              The agent still edits the repo, and you review the diff.
            </p>
          </article>
          <article id="connect">
            <McpLogo />
            <h3 className="mt-6 text-2xl font-semibold">Connect through MCP</h3>
            <p className="text-muted-foreground mt-4 text-base leading-relaxed">
              Let your agent fetch edits.
              <br />
              Cloud, Local or Self-hosted.
            </p>
          </article>
          <article>
            <Terminal aria-hidden="true" className="size-10" />
            <h3 className="mt-6 text-2xl font-semibold">Use the CLI</h3>
            <p className="text-muted-foreground mt-4 text-base leading-relaxed">
              <span className="font-mono">designmode-app</span> runs version,
              tools, status, schema, and call. Cloud is the default;{" "}
              <span className="font-mono">--mode</span> selects local or
              self-hosted. It does not start the local bridge.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
