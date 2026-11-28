"use client";

import { useState } from "react";

import { ArrowRight, Cloud, Monitor, Server } from "lucide-react";

import { cn } from "@/lib/utils";

type ModeId = "cloud" | "local" | "self-hosted";

interface ModeConfig {
  id: ModeId;
  label: string;
  badge: string;
  icon: typeof Cloud;
  hops: [string, string, string];
  summary: string;
}

const modes: ModeConfig[] = [
  {
    id: "cloud",
    label: "Cloud",
    badge: "Default",
    icon: Cloud,
    hops: ["Extension (Cloud)", "mcp.designmode.app/mcp", "AI App (Bearer token)"],
    summary: "No companion process · 60s relay buffer",
  },
  {
    id: "local",
    label: "Local",
    badge: "On-device",
    icon: Monitor,
    hops: ["Extension (Local :9960)", "mcp-local (stdio)", "AI App"],
    summary: "No relay traffic · Local Node.js checkout",
  },
  {
    id: "self-hosted",
    label: "Self-hosted",
    badge: "Your infra",
    icon: Server,
    hops: ["Extension (Custom URL)", "mcp-cloud (Node + Redis)", "AI App (Relay token)"],
    summary: "Your deployment · TLS + bearer auth",
  },
];

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-ink text-ink-foreground mt-4 max-w-full overflow-x-auto rounded-xl p-4 font-mono text-base leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

export function McpConnectionModes() {
  const [activeMode, setActiveMode] = useState<ModeId>("cloud");

  return (
    <div className="mt-10 space-y-6">
      <div
        role="tablist"
        aria-label="MCP connection modes"
        className="grid gap-4 md:grid-cols-3"
      >
        {modes.map((mode) => {
          const Icon = mode.icon;
          const isActive = activeMode === mode.id;

          return (
            <button
              key={mode.id}
              type="button"
              role="tab"
              id={`tab-${mode.id}`}
              aria-selected={isActive}
              aria-controls={`panel-${mode.id}`}
              onClick={() => setActiveMode(mode.id)}
              className={cn(
                "bg-card flex flex-col justify-between rounded-xl border p-5 text-left text-base transition-colors",
                isActive
                  ? "border-primary bg-accent/40 ring-primary/20 ring-2"
                  : "hover:border-foreground/30",
              )}
            >
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 font-semibold">
                    <Icon
                      aria-hidden="true"
                      className={cn(
                        "size-5 shrink-0",
                        isActive ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                    {mode.label}
                  </span>
                  <span className="text-muted-foreground rounded-md border px-2 py-0.5 text-base font-normal">
                    {mode.badge}
                  </span>
                </div>

                <div
                  aria-hidden="true"
                  className="bg-background/80 mt-4 flex flex-col gap-1.5 rounded-lg border p-3"
                >
                  {mode.hops.map((hop, index) => (
                    <div key={hop} className="flex items-center gap-2">
                      {index > 0 ? (
                        <ArrowRight className="text-muted-foreground size-4 shrink-0" />
                      ) : (
                        <span className="bg-primary/70 size-2 shrink-0 rounded-full" />
                      )}
                      <span className="min-w-0 font-mono text-base break-words">
                        {hop}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <span className="text-muted-foreground mt-4 block text-base font-normal">
                {mode.summary}
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`panel-${activeMode}`}
        aria-labelledby={`tab-${activeMode}`}
        className="bg-card rounded-xl border p-6 sm:p-8"
      >
        {activeMode === "cloud" && (
          <div className="space-y-4">
            <h3 className="text-2xl font-semibold">Cloud setup · Streamable HTTP</h3>
            <p className="text-muted-foreground text-base leading-relaxed">
              No companion process to run. Open the extension’s MCP page from
              its header chip, keep Cloud selected, create an anonymous
              credential, and pair your agent with that bearer token. No Design
              Mode account or OAuth sign-in is used.
            </p>
            <CodeBlock>{"https://mcp.designmode.app/mcp"}</CodeBlock>
            <p className="text-muted-foreground text-base leading-relaxed">
              Use the apex host and the <code>/mcp</code> path—the extension’s
              event-stream URL is not the agent endpoint. Keep bearer tokens out
              of chat, screenshots, shell history, and committed configuration.
            </p>
          </div>
        )}

        {activeMode === "local" && (
          <div className="space-y-4">
            <h3 className="text-2xl font-semibold">Local setup · stdio bridge</h3>
            <p className="text-muted-foreground text-base leading-relaxed">
              Your MCP client starts the companion over stdio and talks to the
              extension on localhost (default port <code>9960</code>), with no
              Design Mode relay traffic. Review and clone the{" "}
              <a
                href="https://github.com/SandeepBaskaran/design-mode"
                className="underline underline-offset-4"
              >
                source repository
              </a>
              , run <code>npm ci</code> at the root, and configure your client to
              launch:
            </p>
            <CodeBlock>
              {
                "npm start --prefix /absolute/path/to/design-mode/packages/mcp-local"
              }
            </CodeBlock>
            <p className="text-muted-foreground text-base leading-relaxed">
              For a stdio JSON entry, use command <code>npm</code> and args{" "}
              <code>
                [&quot;start&quot;, &quot;--prefix&quot;,
                &quot;/absolute/path/to/design-mode/packages/mcp-local&quot;]
              </code>
              . The published agent CLI <code>@designmode-app/cli</code> (
              <code>designmode-app</code>) does not start this bridge and sends no
              analytics. If another app uses port 9960, set <code>DM_PORT</code>{" "}
              in the companion’s environment and match the extension’s Local port;
              never kill a foreign process.
            </p>
          </div>
        )}

        {activeMode === "self-hosted" && (
          <div className="space-y-4">
            <h3 className="text-2xl font-semibold">
              Self-hosted setup · Node.js + Redis
            </h3>
            <p className="text-muted-foreground text-base leading-relaxed">
              Deploy <code>packages/mcp-cloud</code> with Redis on infrastructure
              you operate using its{" "}
              <a
                href="https://github.com/SandeepBaskaran/design-mode/tree/main/packages/mcp-cloud"
                className="underline underline-offset-4"
              >
                deployment guide
              </a>
              . Keep TLS and bearer authentication enabled, set the extension’s
              relay base URL, and register an anonymous credential on your
              deployment—not a hosted Cloud token.
            </p>
            <CodeBlock>{"https://your-relay.example/mcp"}</CodeBlock>
            <p className="text-muted-foreground text-base leading-relaxed">
              In your client configuration below, replace only the Cloud URL with
              your deployment’s <code>/mcp</code> endpoint and supply that
              relay’s bearer token locally.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
