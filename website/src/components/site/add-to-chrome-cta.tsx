"use client";

import Image from "next/image";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CWS_URL =
  "https://chromewebstore.google.com/detail/design-mode/ighgobegfcmjagombgnfhgioflinojih";

type GtagFn = (
  command: "event",
  action: string,
  params: Record<string, unknown>,
) => void;

function trackCtaClick() {
  const w = window as unknown as { gtag?: GtagFn };
  if (w.gtag) w.gtag("event", "cta_click", { cta: "add_to_chrome" });
}

export function AddToChromeCta({
  size = "default",
  label = "Add to Chrome",
  className,
  iconSize = 18,
}: {
  size?: "default" | "sm" | "lg";
  label?: string;
  className?: string;
  iconSize?: number;
}) {
  return (
    <Button asChild size={size} className={cn("gap-2", className)}>
      <a
        href={CWS_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={trackCtaClick}
      >
        <Image
          src="/chrome.svg"
          width={iconSize}
          height={iconSize}
          alt=""
          aria-hidden="true"
          className="shrink-0"
        />
        {label}
      </a>
    </Button>
  );
}
