"use client";

import { useState } from "react";

import Link from "next/link";

import { Code2, Plug } from "lucide-react";

import { mcpClients } from "@/lib/mcp-guide";
import { cn } from "@/lib/utils";

type AppId = "Claude Code" | "Cursor" | "VS Code / Copilot" | "Other apps";

interface AppTab {
  id: AppId;
  label: string;
  maskLogo?: { src: string; colour?: string };
  icon?: typeof Code2;
}

const appTabs: AppTab[] = [
  {
    id: "Claude Code",
    label: "Claude Code",
    maskLogo: { src: "/logos/icons/claude.svg", colour: "#D97757" },
  },
  {
    id: "Cursor",
    label: "Cursor",
    maskLogo: { src: "/logos/icons/cursor.svg" },
  },
  {
    id: "VS Code / Copilot",
    label: "VS Code / Copilot",
    icon: Code2,
  },
  {
    id: "Other apps",
    label: "Other apps",
    icon: Plug,
  },
];

export function McpAppSetup() {
  const [activeApp, setActiveApp] = useState<AppId>("Claude Code");
  const selectedClient = mcpClients.find((client) => client.name === activeApp);

  return (
    <div className="mt-10 space-y-6">
      <div
        role="tablist"
        aria-label="MCP client applications"
        className="flex flex-wrap justify-center gap-2.5"
      >
        {appTabs.map((tab) => {
          const isActive = activeApp === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`app-tab-${tab.id.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
              aria-selected={isActive}
              aria-controls="app-setup-panel"
              onClick={() => setActiveApp(tab.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-base font-medium transition-colors",
                isActive
                  ? "border-primary bg-accent/60 text-foreground ring-primary/20 ring-2"
                  : "bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              {tab.maskLogo ? (
                <span
                  aria-hidden="true"
                  className="size-4 shrink-0"
                  style={{
                    backgroundColor: tab.maskLogo.colour ?? "currentColor",
                    maskImage: `url(${tab.maskLogo.src})`,
                    WebkitMaskImage: `url(${tab.maskLogo.src})`,
                    maskSize: "contain",
                    WebkitMaskSize: "contain",
                    maskRepeat: "no-repeat",
                    WebkitMaskRepeat: "no-repeat",
                    maskPosition: "center",
                    WebkitMaskPosition: "center",
                  }}
                />
              ) : Icon ? (
                <Icon aria-hidden="true" className="size-4 shrink-0" />
              ) : null}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id="app-setup-panel"
        aria-labelledby={`app-tab-${activeApp.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
        className="bg-card rounded-xl border p-6 text-base leading-relaxed sm:p-8"
      >
        {selectedClient ? (
          <div>
            <h3 className="text-xl font-semibold">{selectedClient.name}</h3>
            <p className="text-muted-foreground mt-1 text-base font-medium">
              {selectedClient.location}
            </p>
            <p className="text-muted-foreground mt-4 text-base leading-relaxed">
              {selectedClient.description}
            </p>
            <pre className="bg-ink text-ink-foreground mt-6 max-w-full overflow-x-auto rounded-xl p-4 font-mono text-base leading-relaxed">
              <code>{selectedClient.code}</code>
            </pre>
            <a
              href={selectedClient.source}
              className="mt-6 inline-block underline underline-offset-4"
            >
              Official {selectedClient.name} MCP documentation →
            </a>
          </div>
        ) : (
          <div>
            <h3 className="text-xl font-semibold">
              Claude Desktop, Windsurf, Cline and other apps
            </h3>
            <p className="text-muted-foreground mt-4 text-base leading-relaxed">
              MCP support alone is not enough: Cloud and Self-hosted require
              Streamable HTTP and a custom Authorization bearer header. A
              connector that only supports OAuth or has no custom-header input
              cannot connect directly with this token. Do not try an OAuth login
              as a substitute. Check your installed client’s current
              documentation; choose Local if it supports stdio, or use Copy as
              Prompt.
            </p>
            <p className="text-muted-foreground mt-4 text-base leading-relaxed">
              For Claude Desktop, use its documented local-server configuration
              for Local mode rather than assuming the remote Connectors UI
              accepts bearer headers. Configuration files and reload steps
              differ by app.
            </p>
            <p className="mt-4 text-base">
              <Link
                href="/blog/mcp-setup"
                className="underline underline-offset-4"
              >
                Detailed setup guide →
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
