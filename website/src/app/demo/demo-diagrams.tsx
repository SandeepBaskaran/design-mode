import {
  ArrowRight,
  ExternalLink,
  PanelRight,
  PictureInPicture2,
} from "lucide-react";

export function PanelModesDiagram() {
  const states = [
    {
      title: "Docked",
      subtitle: "Default Chrome side panel",
      note: "Lives beside the tab",
      icon: PanelRight,
    },
    {
      title: "Floating",
      subtitle: "Pop-out icon in header",
      note: "Detached window bound to tab",
      icon: ExternalLink,
    },
    {
      title: "Pin on top",
      subtitle: "PiP icon (Chrome 116+)",
      note: "Stays above all windows",
      icon: PictureInPicture2,
    },
  ];

  return (
    <div
      className="my-4 grid gap-3 sm:grid-cols-3"
      aria-label="Chromium panel mode transitions"
    >
      {states.map((state) => {
        const Icon = state.icon;
        return (
          <div
            key={state.title}
            className="bg-card relative flex flex-col justify-between rounded-xl border p-4 text-base"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-foreground inline-flex items-center gap-2 font-semibold">
                <Icon aria-hidden="true" className="text-primary size-4 shrink-0" />
                {state.title}
              </span>
            </div>
            <span className="text-foreground mt-2 font-medium">{state.subtitle}</span>
            <span className="text-muted-foreground mt-1 text-base">{state.note}</span>
          </div>
        );
      })}
    </div>
  );
}

export function InspectorFlowDiagram() {
  const stages = [
    { chip: "Hovering", detail: "Blue outline + alignment guides" },
    { chip: "Selected", detail: "Click locks element into Design tab" },
    { chip: "Multi-select", detail: "Shift+Click or Select matching layers" },
  ];

  return (
    <div
      className="my-4 flex flex-col gap-2 sm:flex-row sm:items-stretch"
      aria-label="Selection state progression"
    >
      {stages.map((stage, index) => (
        <div key={stage.chip} className="flex flex-1 items-center gap-2">
          <div className="bg-card w-full rounded-xl border p-3.5 text-base">
            <span className="bg-accent text-foreground inline-block rounded-md px-2.5 py-0.5 text-base font-semibold">
              {stage.chip}
            </span>
            <p className="text-muted-foreground mt-2 text-base">{stage.detail}</p>
          </div>
          {index < stages.length - 1 && (
            <ArrowRight
              aria-hidden="true"
              className="text-muted-foreground hidden size-4 shrink-0 sm:block"
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function McpModesPreviewDiagram() {
  const modes = [
    { name: "Cloud", hop: "Extension → mcp.designmode.app → Agent" },
    { name: "Local", hop: "Extension → localhost:9960 (stdio) → Agent" },
    { name: "Self-hosted", hop: "Extension → Your Node+Redis relay → Agent" },
  ];

  return (
    <div className="my-4 grid gap-3 sm:grid-cols-3" aria-label="MCP connection modes">
      {modes.map((mode) => (
        <div key={mode.name} className="bg-card rounded-xl border p-3.5 text-base">
          <span className="text-foreground font-semibold">{mode.name}</span>
          <p className="text-muted-foreground mt-1 text-base break-words">{mode.hop}</p>
        </div>
      ))}
    </div>
  );
}
