import { ArrowRight } from "lucide-react";

type Stage = "canvas" | "live" | "ide";

const competitorStages: Record<string, { stage: Stage; label: string }> = {
  "design-mode-vs-magicpath": { stage: "canvas", label: "a shared AI design canvas" },
  "design-mode-vs-figma-dev-mode": { stage: "canvas", label: "design file inspection" },
  "design-mode-vs-figma-make": { stage: "canvas", label: "a prompt-to-prototype canvas" },
  "design-mode-vs-builder-io-visual-copilot": { stage: "canvas", label: "a design-to-code platform" },
  "design-mode-vs-locofy": { stage: "canvas", label: "design-to-code export" },
  "design-mode-vs-cursor-design-mode": { stage: "ide", label: "an IDE-native preview editor" },
};

export function WorkflowSpectrumDiagram({
  slug,
  competitor,
}: {
  slug: string;
  competitor: string;
}) {
  const info = competitorStages[slug] ?? {
    stage: "live" as Stage,
    label: "in-browser visual or feedback tools",
  };

  const stages: { id: Stage; title: string; role: string }[] = [
    {
      id: "canvas",
      title: "1. Design canvas",
      role: "Blank-slate mockups & prototypes",
    },
    {
      id: "live",
      title: "2. Live rendered page",
      role: "Edit & annotate the real DOM",
    },
    {
      id: "ide",
      title: "3. Source repo / IDE",
      role: "Commit reviewed code changes",
    },
  ];

  return (
    <div
      className="bg-card rounded-xl border p-5 sm:p-6"
      aria-label="Workflow position comparison"
    >
      <p className="text-foreground text-base font-semibold">
        Where each tool operates in the design-to-code loop
      </p>
      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-stretch">
        {stages.map((stage, index) => {
          const hasDesignMode = stage.id === "live";
          const hasCompetitor = stage.id === info.stage;

          return (
            <div key={stage.id} className="flex flex-1 items-center gap-2">
              <div className="bg-background flex h-full w-full flex-col justify-between rounded-lg border p-4">
                <div>
                  <p className="text-foreground font-semibold">{stage.title}</p>
                  <p className="text-muted-foreground mt-1 text-base">{stage.role}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {hasDesignMode && (
                    <span className="bg-primary text-primary-foreground rounded-md px-2.5 py-0.5 text-base font-medium">
                      Design Mode
                    </span>
                  )}
                  {hasCompetitor && (
                    <span className="bg-muted text-foreground rounded-md border px-2.5 py-0.5 text-base font-medium">
                      {competitor}
                    </span>
                  )}
                </div>
              </div>
              {index < stages.length - 1 && (
                <ArrowRight
                  aria-hidden="true"
                  className="text-muted-foreground hidden size-4 shrink-0 md:block"
                />
              )}
            </div>
          );
        })}
      </div>
      <p className="text-muted-foreground mt-4 text-base">
        Design Mode operates on the live rendered page and hands structured
        changes to your coding agent; {competitor} focuses on {info.label}.
      </p>
    </div>
  );
}
