import Image from "next/image";

import { ArrowDownUp, Copy, Plug } from "lucide-react";

import {
  CHROME_WEB_STORE_URL,
  FIREFOX_AMO_URL,
  SAFARI_RELEASE_URL,
} from "@/lib/install-links";
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

export function BrowserHandoff() {
  return (
    <section className="py-16 md:py-24 lg:py-32" aria-labelledby="browser-handoff-heading">
      <div className="container max-w-5xl">
        <h2
          id="browser-handoff-heading"
          className="w-full max-w-[975px] text-2xl leading-tight tracking-tight md:text-4xl lg:text-5xl"
        >
          Start in your browser.
          <br />
          <span className="text-muted-foreground">
            Take the details wherever you work.
          </span>
        </h2>
        <div className="mt-16 grid gap-x-24 gap-y-16 md:grid-cols-2">
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
            <Plug aria-hidden="true" className="size-10" />
            <h3 className="mt-6 text-2xl font-semibold">Connect through MCP</h3>
            <p className="text-muted-foreground mt-4 text-base leading-relaxed">
              Let your agent fetch edits.
              <br />
              Cloud, Local or Self-hosted.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
