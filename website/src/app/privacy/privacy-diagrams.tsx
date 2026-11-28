import { ArrowLeftRight, Check, ShieldOff, X } from "lucide-react";

export function NetworkBoundariesDiagram() {
  const lanes = [
    {
      mode: "No MCP (default fresh install)",
      path: ["Extension", "All MCP transports closed", "No relay traffic"],
      detail:
        "Cloud is pre-selected in UI, but zero MCP network calls leave the browser until you explicitly connect.",
    },
    {
      mode: "Local mode",
      path: ["Extension", "ws://127.0.0.1:9960", "Local MCP companion"],
      detail:
        "Token-authenticated localhost WebSocket. No Design Mode hosted relay traffic; doctor probes only localhost.",
    },
    {
      mode: "Cloud mode",
      path: [
        "Extension",
        "mcp.designmode.app (SHA-256 hash + ~60s Redis queue)",
        "AI Agent",
      ],
      detail:
        "Registers an anonymous credential. Responses delete on consumption; 60s expiry is best-effort.",
    },
    {
      mode: "Self-hosted mode",
      path: ["Extension", "Your relay URL (Node.js + Redis)", "AI Agent"],
      detail:
        "Operator-controlled deployment. Your hosting, retention, logging, and access rules apply.",
    },
  ];

  return (
    <div className="not-prose my-6 space-y-3" aria-label="Network boundary diagram">
      {lanes.map((lane) => (
        <div
          key={lane.mode}
          className="bg-card rounded-xl border p-4 text-base"
        >
          <p className="text-foreground font-semibold">{lane.mode}</p>
          <div className="mt-3 flex flex-wrap items-center justify-start gap-2">
            {lane.path.map((node, index) => (
              <div key={node} className="flex items-center gap-2">
                {index > 0 && (
                  <ArrowLeftRight
                    aria-hidden="true"
                    className="text-muted-foreground size-4 shrink-0"
                  />
                )}
                <span className="bg-muted text-foreground rounded-lg border px-3 py-1 text-center text-base break-words">
                  {node === "mcp.designmode.app (SHA-256 hash + ~60s Redis queue)" ? (
                    <>
                      mcp.designmode.app
                      <br />
                      (SHA-256 hash + ~60s Redis queue)
                    </>
                  ) : (
                    node
                  )}
                </span>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground mt-3 text-base leading-relaxed">
            {lane.detail}
          </p>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsPayloadDiagram() {
  const sent = [
    "Persistent random UUID (dm-analytics-distinct-id)",
    "Browser package (chrome, firefox, or safari)",
    "Extension version & distribution hint",
    "Validated language, timezone & userAgent",
    "Bounded feature name & known error code (or fixed fallback)",
  ];

  const neverSent = [
    "Page URLs or origins",
    "DOM selectors or element hierarchy",
    "Style, text, DOM edits, or presets",
    "Comment pins or region notes",
    "Screenshots, tokens, or raw error stacks",
  ];

  return (
    <div
      className="not-prose my-6 grid gap-4 md:grid-cols-2"
      aria-label="Analytics data boundary"
    >
      <div className="bg-card rounded-xl border p-5">
        <p className="text-foreground font-semibold">
          Sent in configured release builds
        </p>
        <ul className="mt-3 space-y-2 text-base">
          {sent.map((item) => (
            <li key={item} className="text-muted-foreground flex gap-2">
              <Check
                aria-hidden="true"
                className="text-primary mt-1 size-4 shrink-0"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-card rounded-xl border p-5">
        <p className="text-foreground flex items-center gap-2 font-semibold">
          <ShieldOff aria-hidden="true" className="text-primary size-4 shrink-0" />
          Never included in the analytics
        </p>
        <ul className="mt-3 space-y-2 text-base">
          {neverSent.map((item) => (
            <li key={item} className="text-muted-foreground flex gap-2">
              <X
                aria-hidden="true"
                className="text-muted-foreground mt-1 size-4 shrink-0"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
