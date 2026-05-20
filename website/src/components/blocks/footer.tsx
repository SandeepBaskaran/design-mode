import Link from "next/link";

import { ArrowUpRight } from "lucide-react";

import { ProductHunt } from "@/components/blocks/product-hunt";
import { AddToChromeCta } from "@/components/site/add-to-chrome-cta";
import { Button } from "@/components/ui/button";

const REPO_URL = "https://github.com/SandeepBaskaran/design-mode";
const X_URL = "https://x.com/sandeepbaskaran";
const SPONSORS_URL = "https://github.com/sponsors/SandeepBaskaran";

export function Footer() {
  const navigation = [
    { name: "Features", href: "/features" },
    { name: "Demo", href: "/demo" },
    { name: "MCP", href: "/mcp" },
    { name: "About", href: "/about" },
    { name: "Contact", href: "/contact" },
    { name: "Privacy", href: "/privacy" },
  ];

  const social = [
    { name: "GitHub", href: REPO_URL },
    { name: "X (Twitter)", href: X_URL },
    { name: "Sponsor", href: SPONSORS_URL },
  ];

  return (
    <footer className="flex flex-col items-center gap-14 pt-28 pb-12 lg:pt-32">
      <div className="container space-y-3 text-center">
        <div className="mb-6 flex justify-center">
          <ProductHunt />
        </div>
        <h2 className="text-2xl tracking-tight md:text-4xl lg:text-5xl">
          Design directly in your browser.
        </h2>
        <p className="text-muted-foreground mx-auto max-w-xl leading-snug text-balance">
          Free forever, open source. Edit any live site with visual
          controls and ship the changes to your coding agent over MCP.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
          <Button variant="outline" asChild>
            <Link href="/demo">Try by yourself</Link>
          </Button>
          <AddToChromeCta />
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
      </nav>

      <p className="text-muted-foreground text-center text-xs">
        Made by{" "}
        <a
          href="https://sandeepbaskaran.com"
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
