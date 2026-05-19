import { Smartphone } from "lucide-react";

// Visible only below md breakpoint — Design Mode is a desktop-only
// Chrome extension, so mobile visitors need an immediate cue that
// they should come back from a laptop / desktop.
export function MobileNotice() {
  return (
    <div className="bg-muted text-muted-foreground border-border flex items-center justify-center gap-2 border-b px-4 py-2 text-xs md:hidden">
      <Smartphone className="size-3.5" aria-hidden="true" />
      <span>Design Mode is a desktop Chrome extension.</span>
    </div>
  );
}
