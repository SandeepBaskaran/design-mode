import Link from "next/link";

import {
  Camera,
  CheckCircle2,
  Cloud,
  Copy,
  Eraser,
  FileDown,
  GitCompareArrows,
  ListChecks,
  ListTree,
  Monitor,
  Server,
  Send,
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { withNavRef } from "@/lib/nav-ref";

export const metadata = {
  title: {
    absolute: "Send browser design changes to coding agents | Design Mode",
  },
  description:
    "Copy visual changes as Markdown or connect Design Mode to a compatible coding agent through Cloud, Local or Self-hosted MCP.",
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
    type: "website",
    title: "Send browser design changes to coding agents | Design Mode",
    description:
      "Copy visual changes as Markdown or connect Design Mode to a compatible coding agent through Cloud, Local or Self-hosted MCP.",
    url: "https://designmode.app/mcp",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Design Mode browser visual editor for AI coding agents",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Send browser design changes to coding agents | Design Mode",
    description:
      "Copy visual changes as Markdown or connect Design Mode to a compatible coding agent through Cloud, Local or Self-hosted MCP.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Design Mode browser visual editor for AI coding agents",
      },
    ],
  },
};

// Illustrative transport settings only. MCP clients use different wrappers,
// scopes, files and authentication rules; the verified client-specific guide
// lives at /docs/mcp-setup.
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
    tagline: "Selected by default; connects only after setup.",
    description:
      "Create an anonymous credential, then connect the extension and agent through mcp.designmode.app. Agent calls use Streamable HTTP; the extension receives requests over an authenticated event stream.",
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
      "Run the companion MCP server on your own machine. Design Mode MCP traffic stays on localhost.",
    bestFor:
      "Best for: power users with a terminal who want no Design Mode relay egress and the lowest possible latency.",
    config: localConfig,
    note: "No npm package to install — clone the repo, run npm install, and point cwd at the absolute path of the repo root. npm start launches the local companion server. Concurrent agent sessions attach to one shared owner on port 9960; if that owner closes, a surviving session takes ownership on its next tool call. Design Mode never kills a foreign process. If another app needs 9960, set DM_PORT to another port and select the same Local port in the extension.",
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
    description:
      "Read style, text, DOM and token changes, comments, addressable items, CSS and hand-off state.",
  },
  {
    name: "apply_changes",
    icon: Wand2,
    description: "Apply a structured patch back to the page from the agent.",
  },
  {
    name: "set_change_status",
    icon: ListChecks,
    description:
      "Mark changes/comments to-do, in-progress, or resolved as you implement them — the user sees the status in their Changes tab.",
  },
  {
    name: "clear_changes",
    icon: Eraser,
    description: "Wipe the current change buffer — useful between iterations.",
  },
  {
    name: "get_session_summary",
    icon: GitCompareArrows,
    description:
      "Connection status, active browser sessions, tracked-item counts and the current hand-off marker.",
  },
  {
    name: "export_changes",
    icon: FileDown,
    description: "Export the current changes as CSS, Tailwind, SCSS or JSX.",
  },
  {
    name: "get_screenshot",
    icon: Camera,
    description:
      "Capture the edited viewport or crop to an element or comment region.",
  },
  {
    name: "mark_comment_resolved",
    icon: CheckCircle2,
    description:
      "Mark a pinned comment done (or reopen it) once the agent has acted on it.",
  },
];

export default function McpPage() {
  return (
    <>
      {/* Hero — yellow background slab */}
      <Background>
        <section className="py-12 lg:py-16">
          <div className="container max-w-5xl">
            <h1 className="text-3xl tracking-tight sm:text-4xl md:text-5xl">
              Send visual changes to your coding agent
            </h1>
            <p className="text-muted-foreground mt-4 max-w-3xl text-base md:text-2xl">
              Design Mode records what you changed on the rendered page. Copy
              that specification as Markdown, or let a compatible MCP client
              read it and keep the Changes tab in sync while it updates your
              repository.
            </p>
            <div className="text-muted-foreground mt-8 max-w-3xl space-y-4 text-base leading-relaxed">
              <p>
                <strong className="text-foreground">
                  What is Model Context Protocol (MCP)?
                </strong>{" "}
                MCP is an open protocol for connecting AI applications to
                external tools and data. A &quot;tool&quot; is anything the
                agent can read from or write to — a database, a filesystem, a
                web service, or in this case, the design state of your live
                page. Design Mode exposes eight session tools in every mode so
                your agent can read every edit you made in the side panel, push
                patches back to the page, grab screenshots, and mark your
                comments resolved — all without copy-paste. MCP connection,
                mode, and token management now live on their own dedicated page
                inside the extension, opened from the header MCP chip. Local
                also registers <code>wait_for_handoff</code> for opt-in live
                feedback rounds; each Send produces an immutable snapshot, and
                Stop ends the loop without clearing edits. Cloud and Self-hosted
                keep one-shot Send.
              </p>
              <p>
                <strong className="text-foreground">
                  Why three connection modes?
                </strong>{" "}
                Different teams have different constraints. Cloud is selected on
                a fresh install but stays disconnected until you create a
                credential. It suits anyone whose agent can&apos;t reach
                localhost. Local is for power users who want zero network egress
                and the lowest possible latency. Self-hosted is for teams who
                want Cloud ergonomics on their own infrastructure.
              </p>
            </div>
          </div>
        </section>
      </Background>

      {/* Middle — plain */}
      <section className="py-16 lg:py-20">
        <div className="container grid max-w-5xl gap-6 md:grid-cols-2">
          <Card>
            <CardContent className="flex h-full flex-col gap-4 p-6">
              <Copy className="size-6" />
              <h2 className="text-2xl font-semibold">Copy as Prompt</h2>
              <p className="text-muted-foreground text-base leading-relaxed">
                Copy the recorded selectors, properties, old values, new values,
                text edits, DOM changes and comments as Markdown. Paste it into
                any coding agent. No MCP connection is required.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex h-full flex-col gap-4 p-6">
              <Send className="size-6" />
              <h2 className="text-2xl font-semibold">Send to Agent over MCP</h2>
              <p className="text-muted-foreground text-base leading-relaxed">
                Connect a compatible client so it can fetch the change set,
                preview updates in the browser, capture screenshots and mark
                work resolved. The client still needs separate repository
                access.
              </p>
            </CardContent>
          </Card>
        </div>

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
                  <div className="flex items-center gap-4">
                    <Icon className="text-foreground size-6" />
                    <h2 className="text-2xl font-semibold">{mode.name}</h2>
                  </div>
                  <p className="text-muted-foreground text-base font-medium">
                    {mode.tagline}
                  </p>
                  <p className="text-muted-foreground text-base leading-relaxed">
                    {mode.description}
                  </p>
                  <p className="text-muted-foreground mt-auto text-base">
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
            Setup steps, privacy posture, agent compatibility, and cost across
            the three modes.
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
            <code className="bg-muted rounded px-2 py-2 text-base">
              dm_&lt;your-token&gt;
            </code>{" "}
            placeholder with the bearer token from the extension's dedicated MCP
            page (Copy token), and restart the agent.
          </p>

          <Accordion type="single" collapsible className="mt-8 w-full">
            {modes.map((mode) => (
              <AccordionItem key={mode.id} value={mode.id}>
                <AccordionTrigger className="text-2xl font-semibold">
                  {mode.name}
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-6 pt-2">
                    <Snippet label="Generic MCP config — adapt to your client">
                      {mode.config}
                    </Snippet>
                    {mode.note && (
                      <p className="text-muted-foreground text-base">
                        {mode.note}
                      </p>
                    )}
                    <p className="text-muted-foreground text-base">
                      Configuration location, wrapper, transport names and
                      authentication support differ by client and version. Use
                      the client-specific, version-stamped instructions in the{" "}
                      <Link
                        href="/docs/mcp-setup"
                        className="underline underline-offset-8"
                      >
                        MCP setup guide
                      </Link>{" "}
                      rather than pasting this generic shape without checking
                      it.
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
            Give your agent the workflow
          </h2>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            MCP configuration only connects the tools. This optional workflow
            prompt gives an agent a repeatable sequence for retrieving the live
            changes and hand-off marker, mapping them to source, implementing
            them and updating status. Install it in the client-specific command
            location, invoke it after you press{" "}
            <strong className="text-foreground">Send to Agent</strong>, and run{" "}
            <code className="bg-muted rounded px-2 py-2 text-base">
              /design-mode
            </code>
            .
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Button asChild>
              <a href="/design-mode.md" download="design-mode.md">
                <FileDown className="size-4" />
                Download design-mode.md
              </a>
            </Button>
            <span className="text-muted-foreground text-base">
              Portable prompt reference; no MCP connection is required to read
              it.
            </span>
          </div>

          <div className="bg-muted/50 border-border mt-8 rounded-xl border p-4">
            <h3 className="text-base font-semibold">
              Import it using current client documentation
            </h3>
            <p className="text-muted-foreground mt-2 text-base leading-relaxed">
              Prompt and workflow paths change independently of the MCP
              protocol. Paste the file into a chat or save it only at the
              project command location documented by your client version. The
              MCP connection and this optional workflow prompt are separate
              pieces.
            </p>
          </div>
        </div>
      </section>

      {/* Bottom — yellow background slab */}
      <Background variant="bottom">
        <section className="py-20 lg:py-28">
          <DashedLine className="container max-w-5xl" />
          <div className="container mt-16 max-w-5xl">
            <h2 className="text-2xl tracking-tight md:text-3xl">
              The eight session tools
            </h2>
            <p className="text-muted-foreground mt-2 max-w-2xl">
              Every mode exposes the same eight session tools — your agent can
              read the current page diff, push patches back, grab screenshots,
              track change status, and resolve your comments as it works. The
              Local companion also registers <code>wait_for_handoff</code> for
              opt-in feedback rounds with bounded waits, immutable per-Send
              snapshots, and an explicit Stop. Cloud and Self-hosted keep
              one-shot Send.
            </p>

            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {tools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <Card key={tool.name}>
                    <CardContent className="flex flex-col gap-2 p-6">
                      <div className="flex items-center gap-2">
                        <Icon className="text-foreground size-4" />
                        <code className="text-base font-semibold">
                          {tool.name}
                        </code>
                      </div>
                      <p className="text-muted-foreground text-base leading-relaxed">
                        {tool.description}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <p className="text-muted-foreground mt-10 text-base">
              Privacy: Local mode keeps Design Mode MCP traffic on your machine.
              Cloud and Self-hosted modes request a 60-second queue expiry and
              normally delete responses when consumed; expiry is best-effort.{" "}
              <Link href="/privacy" className="underline underline-offset-8">
                Full privacy disclosure →
              </Link>
            </p>

            <DashedLine className="mt-20" />

            <div className="mt-16">
              <h2 className="text-2xl tracking-tight md:text-3xl">
                Compatible AI coding agents
              </h2>
              <p className="text-muted-foreground mt-2 max-w-2xl">
                These clients publish MCP support, but their configuration and
                transport capabilities change by version. Check the setup guide
                and the client&apos;s current documentation:
              </p>
              <ul className="text-foreground mt-6 grid grid-cols-2 gap-x-6 gap-y-2 text-base md:grid-cols-3">
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
              <p className="text-muted-foreground mt-6 max-w-2xl text-base">
                Don&apos;t see your tool? If it speaks MCP, the Self-hosted or
                Cloud snippet above will work. File an issue on{" "}
                <a
                  href={withNavRef(
                    "https://github.com/SandeepBaskaran/design-mode/issues",
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-8"
                >
                  GitHub
                </a>{" "}
                if you hit a version-specific issue so it can be reproduced and
                documented.
              </p>
            </div>
          </div>
        </section>
      </Background>
    </>
  );
}

function Snippet({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <p className="text-muted-foreground mb-2 text-base font-medium">
        {label}
      </p>
      <pre className="bg-ink text-ink-foreground overflow-x-auto rounded-xl p-4 font-mono text-base leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  );
}
