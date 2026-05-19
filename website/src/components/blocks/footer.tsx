import Link from "next/link";

import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";

const CWS_URL =
  "https://chromewebstore.google.com/detail/design-mode/ighgobegfcmjagombgnfhgioflinojih";
const REPO_URL = "https://github.com/SandeepBaskaran/design-mode";
const X_URL = "https://x.com/sandeep_baskaran";
const SPONSORS_URL = "https://github.com/sponsors/SandeepBaskaran";

export function Footer() {
  const navigation = [
    { name: "MCP", href: "/mcp" },
    { name: "Modes", href: "/pricing" },
    { name: "Demo", href: "/demo" },
    { name: "About", href: "/about" },
    { name: "FAQ", href: "/faq" },
    { name: "Contact", href: "/contact" },
  ];

  const social = [
    { name: "GitHub", href: REPO_URL },
    { name: "X (Twitter)", href: X_URL },
    { name: "Sponsor", href: SPONSORS_URL },
  ];

  const legal = [
    { name: "Privacy", href: "/privacy" },
    { name: "Security", href: `${REPO_URL}/blob/main/SECURITY.md` },
    { name: "License (MIT)", href: `${REPO_URL}/blob/main/LICENSE` },
  ];

  return (
    <footer className="flex flex-col items-center gap-14 pt-28 pb-12 lg:pt-32">
      <div className="container space-y-3 text-center">
        <h2 className="text-2xl tracking-tight md:text-4xl lg:text-5xl">
          Design directly in your browser.
        </h2>
        <p className="text-muted-foreground mx-auto max-w-xl leading-snug text-balance">
          Free forever, open source. Edit any live site with visual
          controls and ship the changes to your coding agent over MCP.
        </p>
        <div>
          <Button size="lg" className="mt-4" asChild>
            <a href={CWS_URL} target="_blank" rel="noopener noreferrer">
              Add to Chrome
            </a>
          </Button>
        </div>
      </div>

      <nav className="container flex flex-col items-center gap-4">
        <ul className="flex flex-wrap items-center justify-center gap-6">
          {navigation.map((item) => (
            <li key={item.name}>
              <Link
                href={item.href}
                className="font-medium transition-opacity hover:opacity-75"
              >
                {item.name}
              </Link>
            </li>
          ))}
          {social.map((item) => (
            <li key={item.name}>
              <a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-0.5 font-medium transition-opacity hover:opacity-75"
              >
                {item.name} <ArrowUpRight className="size-4" />
              </a>
            </li>
          ))}
        </ul>
        <ul className="flex flex-wrap items-center justify-center gap-6">
          {legal.map((item) => (
            <li key={item.name}>
              {item.href.startsWith("/") ? (
                <Link
                  href={item.href}
                  className="text-muted-foreground text-sm transition-opacity hover:opacity-75"
                >
                  {item.name}
                </Link>
              ) : (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground text-sm transition-opacity hover:opacity-75"
                >
                  {item.name}
                </a>
              )}
            </li>
          ))}
        </ul>
      </nav>

      <p className="text-muted-foreground text-center text-xs">
        Made by{" "}
        <a
          href={X_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          Sandeep Baskaran
        </a>
        .
      </p>
    </footer>
  );
}
