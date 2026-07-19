"use client";

import { useState } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AddToChromeCta } from "@/components/site/add-to-chrome-cta";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";

const ITEMS = [
  { label: "Features", href: "/features" },
  { label: "Demo", href: "/demo" },
  { label: "MCP", href: "/mcp" },
  { label: "Use cases", href: "/use-cases" },
  { label: "Compare", href: "/compare" },
  { label: "Docs", href: "/docs" },
  { label: "Blog", href: "/blog" },
];

const REPO_URL = "https://github.com/SandeepBaskaran/design-mode";

type GtagFn = (
  command: "event",
  action: string,
  params: Record<string, unknown>,
) => void;

function trackCtaClick(cta: string) {
  const w = window as unknown as { gtag?: GtagFn };
  if (w.gtag) w.gtag("event", "cta_click", { cta });
}

function DesignModeMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="dm-mark-grad" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFCB47" />
          <stop offset="1" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
      <path
        d="M6 3.2 L20 12 L13 13.2 L9.6 19.6 Z"
        fill="url(#dm-mark-grad)"
      />
    </svg>
  );
}

function GithubMark({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

export const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();

  return (
    <section
      className={cn(
        "bg-ink/90 text-ink-foreground absolute left-1/2 z-50 w-[min(95%,1024px)] max-w-[1024px] -translate-x-1/2 rounded-full border border-white/10 shadow-lg backdrop-blur-md transition-all duration-300",
        "top-3",
      )}
    >
      <div className="flex items-center justify-between py-2.5 pr-2.5 pl-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <DesignModeMark size={22} />
          <span className="font-display text-ink-foreground text-sm font-semibold tracking-tight">
            Design Mode
          </span>
        </Link>

        {/* Desktop Navigation */}
        <NavigationMenu className="max-lg:hidden">
          <NavigationMenuList className="gap-4">
            {ITEMS.map((link) => (
              <NavigationMenuItem key={link.label}>
                <Link
                  href={link.href}
                  className={cn(
                    "relative bg-transparent px-1.5 text-sm transition-colors",
                    pathname === link.href
                      ? "text-ink-foreground font-semibold"
                      : "text-ink-foreground/60 hover:text-ink-foreground font-medium",
                  )}
                >
                  {link.label}
                </Link>
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>

        {/* CTA cluster: github → Add to Chrome */}
        <div className="flex items-center gap-2">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackCtaClick("github")}
          >
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-ink-foreground/80 hover:text-ink-foreground hover:bg-white/10"
              aria-label="GitHub repository"
            >
              <GithubMark size={16} />
            </Button>
          </a>
          <div className="max-lg:hidden">
            <AddToChromeCta size="sm" />
          </div>

          {/* Hamburger (mobile only) */}
          <button
            className="text-ink-foreground relative flex size-8 lg:hidden"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Open main menu"
          >
            <div className="absolute top-1/2 left-1/2 block w-[18px] -translate-x-1/2 -translate-y-1/2">
              <span
                aria-hidden="true"
                className={`absolute block h-0.5 w-full rounded-full bg-current transition duration-500 ease-in-out ${isMenuOpen ? "rotate-45" : "-translate-y-1.5"}`}
              />
              <span
                aria-hidden="true"
                className={`absolute block h-0.5 w-full rounded-full bg-current transition duration-500 ease-in-out ${isMenuOpen ? "opacity-0" : ""}`}
              />
              <span
                aria-hidden="true"
                className={`absolute block h-0.5 w-full rounded-full bg-current transition duration-500 ease-in-out ${isMenuOpen ? "-rotate-45" : "translate-y-1.5"}`}
              />
            </div>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        className={cn(
          "bg-ink text-ink-foreground fixed inset-x-0 top-[calc(100%+0.75rem)] flex flex-col rounded-3xl border border-white/10 p-6 shadow-xl transition-all duration-300 ease-in-out lg:hidden",
          isMenuOpen
            ? "visible translate-y-0 opacity-100"
            : "invisible -translate-y-4 opacity-0",
        )}
      >
        <nav className="flex flex-1 flex-col divide-y divide-white/10">
          {ITEMS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className={cn(
                "py-4 text-base transition-colors first:pt-0 last:pb-0",
                pathname === link.href
                  ? "text-ink-foreground font-semibold"
                  : "text-ink-foreground/60 hover:text-ink-foreground font-medium",
              )}
              onClick={() => setIsMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-5">
            <AddToChromeCta className="w-full" />
          </div>
        </nav>
      </div>
    </section>
  );
};
