import Link from "next/link";

import {
  Camera,
  Cloud,
  Eraser,
  FileDown,
  GitCompareArrows,
  ListTree,
  Monitor,
  Server,
  Wand2,
} from "lucide-react";

import { Background } from "@/components/background";
import { ModesComparison } from "@/components/blocks/modes-comparison";
import { DashedLine } from "@/components/dashed-line";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = {
  title: "MCP setup",
  description:
    "Three ways to connect your AI agent to Design Mode — Local, Cloud, or Self-hosted. Step-by-step setup for Claude Desktop, Cursor, and Claude Code.",
};

const localClaude = `{
  "mcpServers": {
    "design-mode": {
      "command": "npx",
      "args": ["-y", "@design-mode/mcp-local"]
    }
  }
}`;

const localCursor = `{
  "design-mode": {
    "command": "npx",
    "args": ["-y", "@design-mode/mcp-local"]
  }
}`;

const cloudClaude = `{
  "mcpServers": {
    "design-mode": {
      "type": "http",
      "url": "https://mcp.designmode.app/mcp",
      "headers": { "Authorization": "Bearer dm_<your-token>" }
    }
  }
}`;

const cloudCursor = `{
  "design-mode": {
    "url": "https://mcp.designmode.app/mcp",
    "headers": { "Authorization": "Bearer dm_<your-token>" }
  }
}`;

const selfClaude = `{
  "mcpServers": {
    "design-mode": {
      "type": "http",
      "url": "https://<your-deploy>.vercel.app/mcp",
      "headers": { "Authorization": "Bearer dm_<your-token>" }
    }
  }
}`;

const selfCursor = `{
  "design-mode": {
    "url": "https://<your-deploy>.vercel.app/mcp",
    "headers": { "Authorization": "Bearer dm_<your-token>" }
  }
}`;

type Mode = {
  id: string;
  name: string;
  icon: React.ElementType;
  tagline: string;
  description: string;
  bestFor: string;
  highlight?: boolean;
  configs: {
    claudeDesktop: string;
    cursor: string;
    claudeCode?: string;
  };
};

const modes: Mode[] = [
  {
    id: "cloud",
    name: "Cloud",
    icon: Cloud,
    tagline: "Default. Hosted SSE relay.",
    description:
      "Use mcp.designmode.app as the relay. The extension dials the relay over HTTPS, your agent connects via the same URL with a bearer token. Edits flow through; nothing persists.",
    bestFor:
      "Best for: anyone who'd rather not run a local process — including agents that can't reach localhost (sandboxed CI, remote VSCode tunnels, web-based agents).",
    highlight: true,
    configs: { claudeDesktop: cloudClaude, cursor: cloudCursor },
  },
  {
    id: "local",
    name: "Local",
    icon: Monitor,
    tagline: "Fastest, fully offline.",
    description:
      "Run the companion MCP server on your own machine. Nothing leaves the laptop.",
    bestFor:
      "Best for: power users with a terminal who want zero network egress and the lowest possible latency.",
    configs: { claudeDesktop: localClaude, cursor: localCursor },
  },
  {
    id: "self-hosted",
    name: "Self-hosted",
    icon: Server,
    tagline: "Same protocol, your own infra.",
    description:
      "Fork packages/mcp-cloud and deploy to your own Vercel project. Point the extension at your URL and issue your own bearer tokens.",
    bestFor:
      "Best for: teams that want the Cloud-mode ergonomics but on infrastructure they operate.",
    configs: { claudeDesktop: selfClaude, cursor: selfCursor },
  },
];

const tools = [
  {
    name: "get_changes",
    icon: ListTree,
    description: "Return the list of style/text/DOM changes for the current session.",
  },
  {
    name: "apply_changes",
    icon: Wand2,
    description: "Apply a structured patch back to the page from the agent.",
  },
  {
    name: "clear_changes",
    icon: Eraser,
    description: "Wipe the current change buffer — useful between iterations.",
  },
  {
    name: "get_session_summary",
    icon: GitCompareArrows,
    description: "High-level diff: what selectors changed, by how many properties.",
  },
  {
    name: "export_changes",
    icon: FileDown,
    description: "Markdown export with selector → property → value lines.",
  },
  {
    name: "get_screenshot",
    icon: Camera,
    description: "Visible-tab PNG of the page in its current edited state.",
  },
];

export default function McpPage() {
  return (
    <Background>
      <section className="py-28 lg:py-32 lg:pt-44">
        <div className="container max-w-5xl">
          <h1 className="text-3xl tracking-tight sm:text-4xl md:text-5xl">
            Connect your AI agent
          </h1>
          <p className="text-muted-foreground mt-4 max-w-3xl text-lg md:text-xl">
            Design Mode talks to Claude Desktop, Cursor, Claude Code, or any
            MCP-aware agent. Pick one of three connection modes, paste the
            snippet, restart your agent.
          </p>
        </div>

        <DashedLine className="container mt-16 max-w-5xl" />

        <div className="container mt-12 grid max-w-5xl gap-6 md:grid-cols-3">
          {modes.map((mode) => {
            const Icon = mode.icon;
            return (
              <Card
                key={mode.id}
                className={mode.highlight ? "outline-primary outline-4" : ""}
              >
                <CardContent className="flex h-full flex-col gap-4 p-6">
                  <div className="flex items-center gap-3">
                    <Icon className="text-foreground size-5" />
                    <h2 className="text-xl font-semibold">{mode.name}</h2>
                  </div>
                  <p className="text-muted-foreground text-sm font-medium">
                    {mode.tagline}
                  </p>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {mode.description}
                  </p>
                  <p className="text-muted-foreground mt-auto text-sm">
                    {mode.bestFor}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <DashedLine className="container mt-20 max-w-5xl" />

        <div className="container mt-16 max-w-5xl">
          <h2 className="text-2xl tracking-tight md:text-3xl">
            Mode comparison
          </h2>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Setup steps, privacy posture, agent compatibility, and cost
            across the three modes.
          </p>
        </div>
        <ModesComparison />

        <DashedLine className="container mt-4 max-w-5xl" />

        <div className="container mt-16 max-w-5xl">
          <h2 className="text-2xl tracking-tight md:text-3xl">
            Config snippets
          </h2>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Paste the right block into your agent's config file, replace any{" "}
            <code className="bg-muted rounded px-1 py-0.5 text-sm">
              dm_&lt;your-token&gt;
            </code>{" "}
            placeholder with the bearer token from your side panel, and
            restart the agent.
          </p>

          <Accordion type="single" collapsible className="mt-8 w-full">
            {modes.map((mode) => (
              <AccordionItem key={mode.id} value={mode.id}>
                <AccordionTrigger className="text-lg font-semibold">
                  {mode.name}
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-6 pt-2">
                    <Snippet label="Claude Desktop — claude_desktop_config.json">
                      {mode.configs.claudeDesktop}
                    </Snippet>
                    <Snippet label="Cursor — ~/.cursor/mcp.json (per-server map)">
                      {mode.configs.cursor}
                    </Snippet>
                    <p className="text-muted-foreground text-sm">
                      Claude Code uses the same JSON as Claude Desktop;
                      add it under <code>mcpServers</code> in your project's{" "}
                      <code>.claude/settings.json</code>.
                    </p>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        <DashedLine className="container mt-20 max-w-5xl" />

        <div className="container mt-16 max-w-5xl">
          <h2 className="text-2xl tracking-tight md:text-3xl">
            The six MCP tools
          </h2>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Every mode exposes the same six tools — your agent can read the
            current page diff, push patches back, and grab screenshots.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool) => {
              const Icon = tool.icon;
              return (
                <Card key={tool.name}>
                  <CardContent className="flex flex-col gap-2 p-5">
                    <div className="flex items-center gap-2">
                      <Icon className="text-foreground size-4" />
                      <code className="text-sm font-semibold">
                        {tool.name}
                      </code>
                    </div>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {tool.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <p className="text-muted-foreground mt-10 text-sm">
            Privacy: Local mode keeps everything on your machine. Cloud and
            Self-hosted modes pass messages through the relay without
            persisting payloads.{" "}
            <Link href="/privacy" className="underline underline-offset-4">
              Full privacy disclosure →
            </Link>
          </p>
        </div>
      </section>
    </Background>
  );
}

function Snippet({
  label,
  children,
}: {
  label: string;
  children: string;
}) {
  return (
    <div>
      <p className="text-muted-foreground mb-2 text-sm font-medium">{label}</p>
      <pre className="bg-muted text-foreground overflow-x-auto rounded-lg border p-4 text-xs leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  );
}
