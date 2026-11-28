import Link from "next/link";

import {
  ArrowRight,
  Camera,
  CheckCircle2,
  Clock,
  Eraser,
  FileDown,
  GitCompareArrows,
  ListChecks,
  ListTree,
  MessageSquare,
  Terminal,
  Wand2,
} from "lucide-react";

import { McpAppSetup } from "./mcp-app-setup";
import { McpConnectionModes } from "./mcp-connection-modes";

import { Background } from "@/components/background";
import { ModesComparison } from "@/components/blocks/modes-comparison";
import { CopyPrompt } from "@/components/site/copy-prompt";
import {
  SectionHeader,
  sectionGap,
  sectionPadding,
} from "@/components/site/section-header";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DESIGN_MODE_SKILL, MCP_SETUP_PROMPT } from "@/lib/mcp-guide";

const title = "Connect your AI app with MCP | Design Mode";
const description =
  "Set up Design Mode with a compatible AI app. Connect through Cloud, Local or Self-hosted MCP, test safely and read your browser design changes.";
export const metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "https://designmode.app/mcp" },
  openGraph: {
    type: "website",
    title,
    description,
    url: "https://designmode.app/mcp",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Design Mode — The visual editor for all your agent’s work",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Design Mode — The visual editor for all your agent’s work",
      },
    ],
  },
};

const tools = [
  {
    name: "get_session_summary",
    icon: GitCompareArrows,
    access: "Read",
    description:
      "Check the connection, active sessions, tracked-item counts and hand-off marker.",
  },
  {
    name: "get_changes",
    icon: ListTree,
    access: "Read",
    description:
      "Fetch recorded styles, text, DOM edits, design tokens and comments, including item IDs and status.",
  },
  {
    name: "get_screenshot",
    icon: Camera,
    access: "Read",
    description:
      "Capture the visible page, or crop to one element or comment. Screenshots can include private page content.",
  },
  {
    name: "export_changes",
    icon: FileDown,
    access: "Read",
    description:
      "Read style changes as CSS, Tailwind, SCSS or JSX. This is separate from the extension's JSON export and Copy as Prompt.",
  },
  {
    name: "apply_changes",
    icon: Wand2,
    access: "Write",
    description:
      "Preview CSS changes in the browser. This does not edit your repository.",
  },
  {
    name: "set_change_status",
    icon: ListChecks,
    access: "Write",
    description:
      "Set specific tracked items to todo, in_progress or resolved using their IDs.",
  },
  {
    name: "mark_comment_resolved",
    icon: CheckCircle2,
    access: "Write",
    description: "Resolve or reopen one pinned comment using its commentId.",
  },
  {
    name: "clear_changes",
    icon: Eraser,
    access: "Destructive",
    description:
      "Clear the tracked session and revert its live-page edits. Ask before using it.",
  },
] as const;

const toolGroups = [
  {
    id: "read",
    title: "Read · 4 tools",
    summary: "Inspect session counts, recorded edits, screenshots, and code exports.",
    items: tools.filter((tool) => tool.access === "Read"),
  },
  {
    id: "write",
    title: "Write & Destructive · 4 tools",
    summary:
      "Preview browser CSS, update item/comment status, or clear the tracked session.",
    items: tools.filter(
      (tool) => tool.access === "Write" || tool.access === "Destructive",
    ),
  },
];

const readSteps = [
  {
    step: "1. Start small",
    call: "get_session_summary({})",
    detail:
      "Check active sessions, item counts, and the hand-off marker before pulling a full report.",
  },
  {
    step: "2. Fetch once, filter locally",
    call: "get_changes({})",
    detail:
      "Call with no arguments and filter unresolved items locally. No server-side pagination, status, or max_chars flags exist.",
  },
  {
    step: "3. Zoom in only when needed",
    call: 'get_screenshot({ "commentId": "<id>" })',
    detail:
      "Crop to one selector, elementId, or commentId, or call export_changes({ \"format\": \"css\" }) if a code snippet helps.",
  },
  {
    step: "4. Keep writes explicit",
    call: 'set_change_status({ "ids": ["<id>"] })',
    detail:
      "Update only selected IDs after verifying source edits. Omitting ids targets every tracked item.",
  },
];

export default function McpPage() {
  return (
    <>
      <Background>
        <section className={sectionPadding} aria-labelledby="mcp-title">
          <div className="container max-w-5xl">
            <SectionHeader
              as="h1"
              eyebrow="Design Mode + your AI app"
              id="mcp-title"
              title="In your agent’s hands"
              description="Copy a prompt, or connect Cloud, Local or Self-hosted MCP. The extension does not grant repository access."
            />
          </div>
        </section>
      </Background>

      <section className={sectionPadding} aria-labelledby="setup-prompt-title">
        <div className="container max-w-5xl">
          <div className="bg-card flex flex-col gap-6 rounded-xl border p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
                <Terminal aria-hidden="true" className="size-5" />
              </div>
              <div>
                <h2 id="setup-prompt-title" className="text-xl font-semibold">
                  Set up with your agent
                </h2>
                <p className="text-muted-foreground mt-1 max-w-xl text-base leading-relaxed">
                  Paste this prompt into Claude Code, Cursor, or VS Code to walk through Cloud, Local, or Self-hosted setup. No token or personal data in this prompt.
                </p>
              </div>
            </div>
            <CopyPrompt
              text={MCP_SETUP_PROMPT}
              className="mt-0 shrink-0 lg:self-end"
              hideIdleNote
            />
          </div>
        </div>
      </section>

      <section className={sectionPadding} aria-labelledby="what-mcp">
        <div className="container max-w-5xl">
          <SectionHeader
            eyebrow="MCP"
            id="what-mcp"
            title="What MCP can do"
            description="A connected agent reads recorded edits, inspects screenshots, and updates item status—while repository access stays in your app."
          />
          <div className={`grid gap-8 rounded-xl border p-6 md:grid-cols-2 md:p-8 ${sectionGap}`}>
            <div>
              <MessageSquare
                aria-hidden="true"
                className="text-primary size-8"
              />
              <h3 className="mt-6 text-2xl font-semibold">
                Ask your agent what’s left
              </h3>
              <p className="text-muted-foreground mt-4 text-base leading-relaxed">
                Your agent fetches the latest changes when you ask or via an
                explicitly enabled polling call—never through always-on
                background monitoring. Reading the list does not edit your
                source files automatically.
              </p>
              <p className="text-muted-foreground mt-4 text-base leading-relaxed">
                Review the{" "}
                <Link
                  href="/blog/changes-tab"
                  className="underline underline-offset-4"
                >
                  Changes tab
                </Link>{" "}
                before sending anything. No MCP support? Use{" "}
                <strong className="text-foreground">Copy as Prompt</strong> for
                a one-time Markdown snapshot.
              </p>
            </div>
            <div
              className="bg-muted/40 min-w-0 rounded-xl border"
              aria-label="Example conversation"
            >
              <p className="text-muted-foreground border-b px-6 py-4 text-base">
                Example conversation
              </p>
              <div className="space-y-6 p-6">
                <div>
                  <p className="text-base font-semibold">You</p>
                  <p className="mt-2">
                    What changes are left to complete in Design Mode?
                  </p>
                </div>
                <div>
                  <p className="text-base font-semibold">
                    Agent · read-only tool call
                  </p>
                  <code className="mt-2 block text-base">
                    get_changes({"{}"})
                  </code>
                </div>
                <div>
                  <p className="text-base font-semibold">Agent</p>
                  <p className="text-muted-foreground mt-2">
                    Two items are still pending in this example:
                  </p>
                  <ul className="mt-2 list-disc space-y-2 pl-5">
                    <li>Increase the hero heading’s line height.</li>
                    <li>
                      Address the comment on the primary button’s contrast.
                    </li>
                  </ul>
                  <p className="text-muted-foreground mt-3">
                    Would you like me to find these in your source?
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="connect"
        className={sectionPadding}
        aria-labelledby="connect-title"
      >
        <div className="container max-w-5xl">
          <SectionHeader
            eyebrow="Connection"
            id="connect-title"
            title="How to connect"
            description="Cloud is the default. Local stays on your machine. Self-hosted runs the relay yourself."
          />
          <McpConnectionModes />
        </div>
      </section>

      <section className={sectionPadding} aria-labelledby="modes-title">
        <div className="container max-w-5xl">
          <SectionHeader
            eyebrow="Modes"
            id="modes-title"
            title="Mode comparison"
            description="Setup, transport and cost for Cloud, Local and Self-hosted. Local MCP stays on localhost."
          />
          <p className="text-muted-foreground mx-auto mt-6 max-w-3xl text-center text-base leading-relaxed">
            Local keeps this MCP transport on localhost; it is not a no-egress
            guarantee for the coding client or other enabled features. See the{" "}
            <Link href="/privacy" className="underline underline-offset-4">
              privacy disclosure
            </Link>{" "}
            for separate data flows.
          </p>
          <Accordion type="single" collapsible className={sectionGap}>
            <AccordionItem value="matrix">
              <AccordionTrigger className="text-base">
                Compare Cloud, Local, and Self-hosted specs (11 details)
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                <ModesComparison />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      <section className={sectionPadding} aria-labelledby="apps-title">
        <div className="container max-w-5xl">
          <SectionHeader
            eyebrow="Clients"
            id="apps-title"
            title="Set up your app"
            description="Merge the Cloud entry into your client’s config without replacing existing servers. Enter the token locally, not in chat."
          />
          <McpAppSetup />
          <p className="text-muted-foreground mt-6 text-base">
            Examples checked against first-party documentation on 29 September
            2026. Client versions and organisation policies can change
            availability. Use the{" "}
            <Link
              href="/blog/mcp-setup"
              className="underline underline-offset-4"
            >
              client setup reference
            </Link>{" "}
            for configuration details and{" "}
            <Link
              href="/blog/troubleshooting"
              className="underline underline-offset-4"
            >
              troubleshooting
            </Link>{" "}
            when a connection check fails.
          </p>
        </div>
      </section>

      <section className={sectionPadding} aria-labelledby="reads-title">
        <div className="container max-w-5xl">
          <SectionHeader
            eyebrow="Reads"
            id="reads-title"
            title="Read, then act"
            description="Start with the session summary, fetch changes once, and update only the IDs you mean to change."
          />
          <ol className={`grid gap-4 md:grid-cols-2 ${sectionGap}`}>
            {readSteps.map((item, index) => (
              <li
                key={item.step}
                className="bg-card flex min-w-0 flex-col justify-between rounded-xl border p-6"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xl font-semibold">{item.step}</h3>
                    {index < readSteps.length - 1 && (
                      <ArrowRight
                        aria-hidden="true"
                        className="text-muted-foreground hidden size-4 shrink-0 md:block"
                      />
                    )}
                  </div>
                  <p className="text-muted-foreground mt-3 text-base leading-relaxed">
                    {item.detail}
                  </p>
                </div>
                <pre className="bg-ink text-ink-foreground mt-4 max-w-full overflow-x-auto rounded-lg px-3 py-2.5 font-mono text-base">
                  <code>{item.call}</code>
                </pre>
              </li>
            ))}
          </ol>
          <p className="text-muted-foreground mt-6 text-base leading-relaxed">
            For opt-in Local live rounds, start <code>wait_for_handoff</code>{" "}
            with the exact <code>pageUrl</code> and{" "}
            <code>timeoutMs ≤ 20000</code>. Continue only with the returned{" "}
            <code>sessionId</code> and <code>after</code> cursor—never fabricate
            a session ID or treat later edits as part of an earlier snapshot.
          </p>
        </div>
      </section>

      <section className={sectionPadding} aria-labelledby="tools-title">
        <div className="container max-w-5xl">
          <SectionHeader
            eyebrow="Tools"
            id="tools-title"
            title="Agent tools"
            description="Cloud, Local and Self-hosted share these eight session tools. Read the discovered schema before each new kind of call."
          />
          <div className={`space-y-8 ${sectionGap}`}>
            {toolGroups.map((group) => (
              <div key={group.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-3">
                  <h3 className="text-xl font-semibold">{group.title}</h3>
                  <p className="text-muted-foreground text-base">
                    {group.summary}
                  </p>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {group.items.map((tool) => {
                    const Icon = tool.icon;
                    return (
                      <Card key={tool.name}>
                        <CardContent className="p-6">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-3">
                              <Icon
                                aria-hidden="true"
                                className="size-5 shrink-0"
                              />
                              <h4 className="min-w-0 font-mono text-base font-semibold break-words">
                                {tool.name}
                              </h4>
                            </div>
                            <span
                              className={
                                tool.access === "Destructive"
                                  ? "text-destructive rounded-md border px-2 py-0.5 text-base font-medium"
                                  : "text-muted-foreground rounded-md border px-2 py-0.5 text-base"
                              }
                            >
                              {tool.access}
                            </span>
                          </div>
                          <p className="text-muted-foreground mt-3 text-base leading-relaxed">
                            {tool.description}
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <Card className="mt-6">
            <CardContent className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <Clock aria-hidden="true" className="size-5 shrink-0" />
                  <h3 className="font-mono text-base font-semibold">
                    wait_for_handoff
                  </h3>
                </div>
                <span className="text-muted-foreground rounded-md border px-2 py-0.5 text-base">
                  Local only · Opt-in
                </span>
              </div>
              <p className="text-muted-foreground mt-3 text-base leading-relaxed">
                Wait up to 20 seconds for an explicit Send to Agent. Each
                feedback response contains an immutable snapshot. Only repeat
                calls after the user chooses live rounds; stop on stopped, busy,
                or an error. Cloud and Self-hosted use one-shot reads.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <Background variant="bottom">
        <section className={sectionPadding} aria-labelledby="skill-title">
          <div className="container max-w-5xl">
            <SectionHeader
              eyebrow="Skill"
              id="skill-title"
              title="The workflow"
              description="The agent skill covers setup, safe connection checks, and a scoped design-to-code workflow. Reading it does not connect MCP or grant tool permissions."
            />
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Button asChild>
                <a href={DESIGN_MODE_SKILL} download="SKILL.md">
                  <FileDown aria-hidden="true" className="size-4" />
                  Download agent skill
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href={DESIGN_MODE_SKILL}>Read SKILL.md</a>
              </Button>
            </div>
            <p className="text-muted-foreground mt-6 text-center text-base">
              Discoverable through the{" "}
              <a
                href="/.well-known/agent-skills/index.json"
                className="underline underline-offset-4"
              >
                skill index
              </a>{" "}
              and{" "}
              <a href="/llms.txt" className="underline underline-offset-4">
                llms.txt
              </a>
              . The existing{" "}
              <a
                href="/design-mode.md"
                className="underline underline-offset-4"
              >
                command prompt
              </a>{" "}
              remains available separately.
            </p>
            <p className="text-muted-foreground mt-6 text-center text-base">
              Local keeps Design Mode MCP traffic on your machine. Cloud and
              Self-hosted relay page data; queue expiry is best-effort.{" "}
              <Link href="/privacy" className="underline underline-offset-4">
                Read the privacy disclosure →
              </Link>
            </p>
          </div>
        </section>
      </Background>
    </>
  );
}
