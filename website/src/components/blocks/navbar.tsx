"use client";

import { useState } from "react";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Github } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";

const ITEMS = [
  { label: "MCP", href: "/mcp" },
  { label: "Modes", href: "/pricing" },
  { label: "Demo", href: "/demo" },
  { label: "About", href: "/about" },
  { label: "FAQ", href: "/faq" },
  { label: "Contact", href: "/contact" },
  { label: "Privacy", href: "/privacy" },
];

const CWS_URL =
  "https://chromewebstore.google.com/detail/design-mode/ighgobegfcmjagombgnfhgioflinojih";
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
          <stop stopColor="#6366f1" />
          <stop offset="1" stopColor="#ec4899" />
        </linearGradient>
      </defs>
      <path
        d="M6 3.2 L20 12 L13 13.2 L9.6 19.6 Z"
        fill="url(#dm-mark-grad)"
      />
    </svg>
  );
}

function ChromeGlyph({ size = 16 }: { size?: number }) {
  return (
    <Image
      src="/chrome.svg"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      className="shrink-0"
    />
  );
}

export const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();

  return (
    <section
      className={cn(
        "bg-background/70 absolute left-1/2 z-50 w-[min(90%,880px)] -translate-x-1/2 rounded-4xl border backdrop-blur-md transition-all duration-300",
        "top-5 lg:top-12",
      )}
    >
      <div className="flex items-center justify-between px-6 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <DesignModeMark size={22} />
          <span className="font-display text-sm font-semibold tracking-tight">
            Design Mode
          </span>
        </Link>

        {/* Desktop Navigation */}
        <NavigationMenu className="max-lg:hidden">
          <NavigationMenuList>
            {ITEMS.map((link) => (
              <NavigationMenuItem key={link.label}>
                <Link
                  href={link.href}
                  className={cn(
                    "relative bg-transparent px-1.5 text-sm font-medium transition-opacity hover:opacity-75",
                    pathname === link.href && "text-muted-foreground",
                  )}
                >
                  {link.label}
                </Link>
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>

        {/* CTA cluster: theme → github → Add to Chrome */}
        <div className="flex items-center gap-2.5">
          <ThemeToggle />
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackCtaClick("github")}
          >
            <Button
              variant="outline"
              size="icon"
              className="size-9"
              aria-label="GitHub repository"
            >
              <Github className="size-4" />
            </Button>
          </a>
          <a
            href={CWS_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackCtaClick("add_to_chrome")}
            className="max-lg:hidden"
          >
            <Button variant="default" className="gap-2">
              <ChromeGlyph size={16} />
              <span className="relative z-10">Add to Chrome</span>
            </Button>
          </a>

          {/* Hamburger (mobile only) */}
          <button
            className="text-muted-foreground relative flex size-8 lg:hidden"
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
          "bg-background fixed inset-x-0 top-[calc(100%+1rem)] flex flex-col rounded-2xl border p-6 transition-all duration-300 ease-in-out lg:hidden",
          isMenuOpen
            ? "visible translate-y-0 opacity-100"
            : "invisible -translate-y-4 opacity-0",
        )}
      >
        <nav className="divide-border flex flex-1 flex-col divide-y">
          {ITEMS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className={cn(
                "text-primary hover:text-primary/80 py-4 text-base font-medium transition-colors first:pt-0 last:pb-0",
                pathname === link.href && "text-muted-foreground",
              )}
              onClick={() => setIsMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <a
            href={CWS_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              trackCtaClick("add_to_chrome");
              setIsMenuOpen(false);
            }}
            className="text-primary hover:text-primary/80 flex items-center gap-2 py-4 text-base font-medium transition-colors last:pb-0"
          >
            <ChromeGlyph size={18} />
            Add to Chrome ↗
          </a>
        </nav>
      </div>
    </section>
  );
};
