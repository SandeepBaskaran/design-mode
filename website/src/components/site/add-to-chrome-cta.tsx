"use client";

import Image from "next/image";

import { Button } from "@/components/ui/button";
import { useInstallTarget } from "@/hooks/use-install-target";
import { cn } from "@/lib/utils";

// Both browser targets download the latest GitHub Release. The icon still follows the visitor's browser.
const STORES = {
  chrome: {
    name: "Chrome",
    label: "Download latest",
    href: "https://github.com/SandeepBaskaran/design-mode/releases/latest",
    icon: "/chrome.svg",
    event: "add_to_chrome",
  },
  firefox: {
    name: "Firefox",
    label: "Download latest",
    href: "https://github.com/SandeepBaskaran/design-mode/releases/latest",
    icon: "/firefox.svg",
    event: "add_to_firefox",
  },
} as const;

type GtagFn = (
  command: "event",
  action: string,
  params: Record<string, unknown>,
) => void;

function trackCtaClick(cta: string) {
  const w = window as unknown as { gtag?: GtagFn };
  if (w.gtag) w.gtag("event", "cta_click", { cta });
}

export function AddToChromeCta({
  size = "default",
  label,
  className,
  iconSize = 16,
}: {
  size?: "default" | "sm" | "lg";
  label?: string;
  className?: string;
  iconSize?: number;
}) {
  const store = STORES[useInstallTarget()];
  return (
    <Button asChild size={size} className={cn("gap-2", className)}>
      <a
        href={store.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackCtaClick(store.event)}
      >
        <Image
          src={store.icon}
          width={iconSize}
          height={iconSize}
          alt=""
          aria-hidden="true"
          className="shrink-0"
        />
        {label ?? store.label}
      </a>
    </Button>
  );
}

// Small icon-only link to the OTHER browser's store, so users know Design
// Mode is available on both. Navbar-only: sits between the GitHub icon and
// the primary CTA. On Chrome it points at Firefox/AMO; on Firefox, Chrome/CWS.
export function OtherStoreLink({ className }: { className?: string }) {
  const target = useInstallTarget();
  const other = target === "firefox" ? STORES.chrome : STORES.firefox;
  return (
    <Button asChild variant="ghost" size="icon-sm" className={className}>
      <a
        href={other.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackCtaClick(`also_${other.event}`)}
        aria-label={`Also available on ${other.name}`}
        title={`Also available on ${other.name}`}
      >
        <Image
          src={other.icon}
          width={16}
          height={16}
          alt=""
          aria-hidden="true"
          className="shrink-0"
        />
      </a>
    </Button>
  );
}
