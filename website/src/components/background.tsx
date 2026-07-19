import React from "react";

import { cn } from "@/lib/utils";

type BackgroundProps = {
  children: React.ReactNode;
  variant?: "top" | "bottom";
  className?: string;
};

// Transparent section wrapper. Previously painted a yellow gradient slab at
// the hero (top) / footer (bottom); that treatment was removed — the page is
// now a flat warm cream with no coloured slabs. Kept as a passthrough so the
// per-page `<Background>` / `<Background variant="bottom">` call sites (and the
// hero-only / footer-only wrapping rule) don't all need editing.
export const Background = ({ children, className }: BackgroundProps) => {
  return <div className={cn("relative", className)}>{children}</div>;
};
