import Image from "next/image";

import { FIREFOX_AMO_URL, SAFARI_RELEASE_URL } from "@/lib/install-links";
import { withNavRef } from "@/lib/nav-ref";

const LINK_CLASS =
  "focus-visible:ring-ring inline-flex items-center gap-1.5 align-bottom whitespace-nowrap font-medium underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none";

function BrowserLink({
  href,
  icon,
  name,
}: {
  href: string;
  icon: string;
  name: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={LINK_CLASS}
    >
      <Image
        src={icon}
        width={16}
        height={16}
        alt=""
        unoptimized
        className="shrink-0"
      />
      {name}
    </a>
  );
}

export function FirefoxBanner() {
  return (
    <div className="w-full bg-[color-mix(in_srgb,var(--primary)_12%,white)]">
      <p className="text-foreground mx-auto min-h-8 px-4 py-2 text-center text-base leading-snug break-words">
        Design Mode is also available for{" "}
        <BrowserLink
          href={withNavRef(FIREFOX_AMO_URL)}
          icon="/firefox.svg"
          name="Firefox"
        />{" "}
        and{" "}
        <BrowserLink
          href={SAFARI_RELEASE_URL}
          icon="/safari.svg"
          name="Safari"
        />
        .
      </p>
    </div>
  );
}
