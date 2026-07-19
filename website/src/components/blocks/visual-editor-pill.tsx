export function VisualEditorPill() {
  return (
    <span className="border-border bg-card text-muted-foreground shadow-xs hover:bg-accent inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors">
      <span className="bg-primary size-1.5 shrink-0 rounded-full" aria-hidden="true" />
      Visual editor that saves your tokens
    </span>
  );
}
