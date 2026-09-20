import Image from "next/image";

import { withNavRef } from "@/lib/nav-ref";

const FIREFOX_AMO_URL =
  "https://addons.mozilla.org/firefox/addon/design-mode-add-on/";

export function FirefoxBanner() {
  return (
    <div className="w-full bg-[color-mix(in_srgb,var(--primary)_12%,white)]">
      <a
        href={withNavRef(FIREFOX_AMO_URL)}
        target="_blank"
        rel="noopener noreferrer"
        className="focus-visible:ring-ring text-foreground mx-auto flex min-h-8 flex-wrap items-center justify-center gap-2 px-4 py-2 text-center text-[12px] leading-snug break-words focus-visible:ring-2 focus-visible:outline-none sm:text-base"
      >
        <Image
          src="/firefox.svg"
          width={16}
          height={16}
          alt=""
          unoptimized
          className="shrink-0"
        />
        Design Mode is also available for Mozilla Firefox.
      </a>
    </div>
  );
}
