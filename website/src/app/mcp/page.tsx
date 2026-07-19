import Link from "next/link";

import {
  Camera,
  CheckCircle2,
  Cloud,
  Eraser,
  FileDown,
  GitCompareArrows,
  ListChecks,
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
  title:
    "MCP setup — Connect Claude Code, Cursor, Claude Desktop, Windsurf & more",
  description:
    "Three ways to connect any MCP-compatible AI coding agent to Design Mode — Cloud (default, hosted), Local (offline), or Self-hosted. Step-by-step setup for Claude Desktop, Claude Code, Cursor, Windsurf, Cline, and any client that speaks Model Context Protocol.",
  keywords: [
    "MCP setup",
    "Model Context Protocol",
    "Claude Code MCP",
    "Cursor MCP",
    "Claude Desktop MCP",
    "Windsurf MCP",
    "Cline MCP",
    "MCP server for design",
    "MCP for AI coding agents",
    "self-hosted MCP",
    "MCP relay",
  ],
  alternates: { canonical: "https://designmode.app/mcp" },
  openGraph: {
    title:
      "MCP setup — Connect Claude Code, Cursor, Claude Desktop, Windsurf & more",
    description:
      "Three connection modes (Cloud, Local, Self-hosted) and the eight MCP tools your agent gets.",
    url: "https://designmode.app/mcp",
    images: ["/og-image.png"],
  },
};

// One reasonable, IDE-agnostic snippet per mode. The `mcpServers`
// wrapper + `type: "http"` is what Claude Code / Claude Desktop / VS Code
// / current Cursor all accept; trim the wrapper if your client wants the
// bare object.
const localConfig = `{
  "mcpServers": {
    "design-mode": {
      "command": "npm",
      "args": ["start"],
      "cwd": "/absolute/path/to/design-mode"
    }
  }
}`;

const cloudConfig = `{
  "mcpServers": {
    "design-mode": {
      "type": "http",
      "url": "https://mcp.designmode.app/mcp",
      "headers": { "Authorization": "Bearer dm_<your-token>" }
    }
  }
}`;

const selfConfig = `{
  "mcpServers": {
    "design-mode": {
      "type": "http",
      "url": "https://<your-deploy>/mcp",
      "headers": { "Authorization": "Bearer dm_<your-token>" }
    }
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
  config: string;
  note?: string;
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
    config: cloudConfig,
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
    config: localConfig,
    note: "No npm package to install — clone the repo, run npm install, and point cwd at the absolute path of the repo root. npm start launches the local companion server.",
  },
  {
    id: "self-hosted",
    name: "Self-hosted",
    icon: Server,
    tagline: "Same protocol, your own infra.",
    description:
      "Fork packages/mcp-cloud and deploy on any Node.js host with Redis — Vercel, Railway, Fly, your own VM. Point the extension at your URL and issue your own bearer tokens.",
    bestFor:
      "Best for: teams that want the Cloud-mode ergonomics but on infrastructure they operate.",
    config: selfConfig,
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
    name: "set_change_status",
    icon: ListChecks,
    description: "Mark changes/comments to-do, in-progress, or resolved as you implement them — the user sees the status in their Changes tab.",
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
  {
    name: "mark_comment_resolved",
    icon: CheckCircle2,
    description: "Mark a pinned comment done (or reopen it) once the agent has acted on it.",
  },
];

export default function McpPage() {
  return (
    <>
      {/* Hero — yellow background slab */}
      <Background>
        <section className="pt-28 pb-12 lg:pt-44 lg:pb-16">
          <div className="container max-w-5xl">
            <h1 className="text-3xl tracking-tight sm:text-4xl md:text-5xl">
              Connect your AI agent over MCP
            </h1>
            <p className="text-muted-foreground mt-4 max-w-3xl text-lg md:text-xl">
              Design Mode talks to Claude Desktop, Claude Code, Cursor,
              Windsurf, Cline, Continue, Zed — any AI coding agent that
              speaks Model Context Protocol. Pick one of three connection
              modes, paste the snippet, restart your agent.
            </p>
            <div className="text-muted-foreground mt-8 max-w-3xl space-y-4 text-base leading-relaxed">
              <p>
                <strong className="text-foreground">
                  What is Model Context Protocol (MCP)?
                </strong>{" "}
                MCP is Anthropic&apos;s open standard for letting AI agents
                call external tools safely. A &quot;tool&quot; is anything
                the agent can read from or write to — a database, a
                filesystem, a web service, or in this case, the design
                state of your live page. Design Mode exposes eight MCP tools
                so your agent can read every edit you made in the side
                panel, push patches back to the page, grab screenshots, and
                mark your comments resolved — all without copy-paste. MCP
                connection, mode, and token management now live on their
                own dedicated page inside the extension, opened from the
                header MCP chip.
              </p>
              <p>
                <strong className="text-foreground">
                  Why three connection modes?
                </strong>{" "}
                Different teams have different constraints. Cloud is the
                no-install default for solo makers and anyone whose agent
                can&apos;t reach localhost. Local is for power users who
                want zero network egress and the lowest possible latency.
                Self-hosted is for teams who want Cloud ergonomics on
                their own infrastructure.
              </p>
            </div>
          </div>
        </section>
      </Background>

      {/* Middle — plain */}
      <section className="py-16 lg:py-20">
        <DashedLine className="container max-w-5xl" />

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
            placeholder with the bearer token from the extension's
            dedicated MCP page (Copy token), and restart the agent.
          </p>

          <Accordion type="single" collapsible className="mt-8 w-full">
            {modes.map((mode) => (
              <AccordionItem key={mode.id} value={mode.id}>
                <AccordionTrigger className="text-lg font-semibold">
                  {mode.name}
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-6 pt-2">
                    <Snippet label="MCP config — Claude Code · Claude Desktop · Cursor · VS Code">
                      {mode.config}
                    </Snippet>
                    {mode.note && (
                      <p className="text-muted-foreground text-sm">
                        {mode.note}
                      </p>
                    )}
                    <p className="text-muted-foreground text-sm">
                      Same JSON everywhere: under <code>mcpServers</code> in
                      Claude Desktop / Claude Code{" "}
                      (<code>.claude/settings.json</code>), or your editor's
                      MCP config. Some clients want the bare{" "}
                      <code>design-mode</code> object without the{" "}
                      <code>mcpServers</code> wrapper.
                    </p>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Bottom — yellow background slab */}
      <Background variant="bottom">
        <section className="py-20 lg:py-28">
          <DashedLine className="container max-w-5xl" />
          <div className="container mt-16 max-w-5xl">
            <h2 className="text-2xl tracking-tight md:text-3xl">
              The eight MCP tools
            </h2>
            <p className="text-muted-foreground mt-2 max-w-2xl">
              Every mode exposes the same eight tools — your agent can read
              the current page diff, push patches back, grab screenshots,
              track change status, and resolve your comments as it works.
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
              Privacy: Local mode keeps everything on your machine. Cloud
              and Self-hosted modes pass messages through the relay
              without persisting payloads.{" "}
              <Link href="/privacy" className="underline underline-offset-4">
                Full privacy disclosure →
              </Link>
            </p>

            <DashedLine className="mt-20" />

            <div className="mt-16">
              <h2 className="text-2xl tracking-tight md:text-3xl">
                Compatible AI coding agents
              </h2>
              <p className="text-muted-foreground mt-2 max-w-2xl">
                Any agent that supports Model Context Protocol works with
                Design Mode. Confirmed:
              </p>
              <ul className="text-foreground mt-6 grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-3">
                <li>• Claude Desktop</li>
                <li>• Claude Code</li>
                <li>• Cursor</li>
                <li>• Windsurf</li>
                <li>• Cline</li>
                <li>• Continue</li>
                <li>• Zed</li>
                <li>• VS Code (with MCP extension)</li>
                <li>• Any custom MCP client</li>
              </ul>
              <p className="text-muted-foreground mt-6 max-w-2xl text-sm">
                Don&apos;t see your tool? If it speaks MCP, the
                Self-hosted or Cloud snippet above will work. File an
                issue on{" "}
                <a
                  href="https://github.com/SandeepBaskaran/design-mode/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4"
                >
                  GitHub
                </a>{" "}
                if you hit a quirk and we&apos;ll add a dedicated snippet.
              </p>
            </div>
          </div>
        </section>
      </Background>
    </>
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
