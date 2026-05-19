import Link from "next/link";

import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const REPO_URL = "https://github.com/SandeepBaskaran/design-mode";

const modes = [
  {
    name: "Local",
    tagline: "Default. The fastest path.",
    description:
      "Run the companion MCP server on your own machine. Zero network egress, zero accounts.",
    features: [
      "Localhost-only — nothing leaves your machine",
      "No bearer token, no signup",
      "Works with Claude Desktop, Cursor, Claude Code",
      "Auto-connects on side panel open",
    ],
    cta: { label: "Setup guide", href: "/mcp" },
  },
  {
    name: "Cloud",
    tagline: "Free, opt-in, hosted.",
    description:
      "Use the hosted mcp.designmode.app relay. Best when your agent runs in a context that can't reach localhost.",
    features: [
      "Hosted SSE relay at mcp.designmode.app",
      "Bearer token registered in side panel",
      "Payload bodies dropped within ~60s",
      "No edits persisted, no training on traffic",
    ],
    highlight: true,
    cta: { label: "How Cloud works", href: "/mcp" },
  },
  {
    name: "Self-hosted",
    tagline: "Take it private.",
    description:
      "Fork packages/mcp-cloud and deploy your own relay on Vercel. Same protocol, your own domain.",
    features: [
      "One-click Vercel deploy from the repo",
      "Your domain, your token issuance",
      "Same SSE protocol — extension just points at your URL",
      "MIT licensed; modify as needed",
    ],
    cta: { label: "View on GitHub", href: `${REPO_URL}/tree/main/packages/mcp-cloud`, external: true },
  },
];

export const Pricing = ({ className }: { className?: string }) => {
  return (
    <section className={cn("py-28 lg:py-32", className)}>
      <div className="container max-w-5xl">
        <div className="space-y-4 text-center">
          <h2 className="text-2xl tracking-tight md:text-4xl lg:text-5xl">
            Three ways to connect
          </h2>
          <p className="text-muted-foreground mx-auto max-w-xl leading-snug text-balance">
            Design Mode is free forever. The only choice is how your edits
            travel from the browser to your AI coding agent. Pick the mode
            that matches where your agent runs.
          </p>
        </div>

        <div className="mt-8 grid items-start gap-5 text-start md:mt-12 md:grid-cols-3 lg:mt-20">
          {modes.map((mode) => (
            <Card
              key={mode.name}
              className={cn(
                mode.highlight && "outline-primary origin-top outline-4",
              )}
            >
              <CardContent className="flex flex-col gap-7 px-6 py-5">
                <div className="space-y-2">
                  <h3 className="text-foreground font-semibold">{mode.name}</h3>
                  <div className="space-y-1">
                    <div className="text-muted-foreground text-lg font-medium">
                      Free
                    </div>
                    <div className="text-muted-foreground text-sm">
                      {mode.tagline}
                    </div>
                  </div>
                </div>

                <p className="text-muted-foreground text-sm leading-snug">
                  {mode.description}
                </p>

                <div className="space-y-3">
                  {mode.features.map((feature) => (
                    <div
                      key={feature}
                      className="text-muted-foreground flex items-start gap-1.5"
                    >
                      <Check className="size-5 shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </div>
                  ))}
                </div>

                {mode.cta.external ? (
                  <a
                    href={mode.cta.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button
                      className="w-fit"
                      variant={mode.highlight ? "default" : "outline"}
                    >
                      {mode.cta.label}
                    </Button>
                  </a>
                ) : (
                  <Link href={mode.cta.href}>
                    <Button
                      className="w-fit"
                      variant={mode.highlight ? "default" : "outline"}
                    >
                      {mode.cta.label}
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};
