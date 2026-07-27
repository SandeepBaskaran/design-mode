"use client";

import { useEffect, useState } from "react";

export type InstallTarget = "chrome" | "firefox";

// Which store the install CTA should point at. The site is statically
// exported, so this is decided client-side. First paint (server + client
// hydration) is "chrome" — the majority, and a working link for no-JS /
// crawlers — then it flips to "firefox" on Firefox after mount. Because the
// initial state matches on both sides, there's no hydration mismatch; Firefox
// (desktop and Android, both of which support add-ons) just sees a brief
// swap to "Add to Firefox".
export function useInstallTarget(): InstallTarget {
  const [target, setTarget] = useState<InstallTarget>("chrome");

  useEffect(() => {
    if (typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent)) {
      setTarget("firefox");
    }
  }, []);

  return target;
}
