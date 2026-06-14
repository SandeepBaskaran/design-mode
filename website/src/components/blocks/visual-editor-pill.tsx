import { Sparkles } from "lucide-react";

/**
 * Pill-shaped badge that reads "Visual editor that saves your tokens".
 * Used between the ProductHunt badge and the hero title in the homepage,
 * and in the same position in the global footer.
 */
export function VisualEditorPill() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm transition-colors hover:bg-secondary">
      <Sparkles className="size-3.5 text-foreground/70" />
      Visual editor that saves your tokens
    </span>
  );
}
