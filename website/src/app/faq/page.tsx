import Link from "next/link";

import { Background } from "@/components/background";
import { DashedLine } from "@/components/dashed-line";
import { JsonLd, faqSchema } from "@/components/site/json-ld";
import { RelatedLinks } from "@/components/site/related-links";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const metadata = {
  title:
    "FAQ — Design Mode questions: installation, MCP, Claude Code, Cursor, privacy",
  description:
    "Frequently asked questions about Design Mode: install, supported browsers, MCP setup for Claude Code / Cursor / Claude Desktop / Windsurf / Cline, privacy, comparisons (DevTools, Figma Dev Mode, Stagewise), licensing, contributing, troubleshooting.",
  keywords: [
    "Design Mode FAQ",
    "Design Mode install help",
    "Design Mode privacy questions",
    "MCP setup FAQ",
    "Design Mode vs Chrome DevTools",
    "Design Mode vs Figma",
    "Claude Code FAQ",
    "Cursor MCP FAQ",
  ],
  alternates: { canonical: "https://designmode.app/faq" },
  openGraph: {
    title: "FAQ — Design Mode",
    description:
      "Install, MCP setup, agent compatibility, privacy, comparisons, and contributing — answered.",
    url: "https://designmode.app/faq",
    images: ["/og-image.png"],
  },
};

type QA = { question: string; answer: string };
type Group = { title: string; items: QA[] };

const groups: Group[] = [
  {
    title: "Getting started",
    items: [
      {
        question: "What is Design Mode?",
        answer:
          "Design Mode is a free, open-source Chrome extension that turns any live website into a visual design surface. Click any element on any page and edit its layout, typography, colour, spacing, copy, or DOM with real controls — then ship the diff to your AI coding agent over Model Context Protocol (MCP). One design tool for designers, developers, QA testers, PMs, indie hackers, and vibe coders.",
      },
      {
        question: "Who is Design Mode for?",
        answer:
          "Designers (edit on the live product, not a drifted mockup), design engineers (own the loop from sketch to PR), frontend developers and vibe coders (visually iterate, then have the agent commit the code), QA / UI testers (export visual bugs with full developer context), product managers (file precise bug reports), content / marketing teams (fix microcopy without a Figma round-trip), indie hackers and solo founders (iterate on their own landing page with an AI agent in the loop), agencies (hand engineering a precise spec), and design-system maintainers (audit token drift on the deployed app).",
      },
      {
        question: "How is Design Mode different from Chrome DevTools?",
        answer:
          "Chrome DevTools is a developer inspector — edits don't persist across reloads, there's no design surface (sliders, colour pickers, motion controls, contrast checker), and there's no handoff to an AI agent. Design Mode is design-intent-first: persistent change history, real visual controls, and one-click ship-to-agent over MCP.",
      },
      {
        question: "Is Design Mode for designers or developers?",
        answer:
          "Both. The shared surface is: edit the live page visually, ship a precise diff to whoever (or whatever AI agent) writes the code.",
      },
      {
        question: "How do I install it?",
        answer:
          "Open the Chrome Web Store listing, click Add to Chrome, pin the side panel. Open any web page and click the toolbar icon to open the panel. No account required. Detailed steps: /docs/install.",
      },
      {
        question: "Which browsers does it work in?",
        answer:
          "Any Chromium-based browser that supports Manifest V3 side panels — Chrome, Edge, Arc, Brave. Firefox is not supported today. Safari is out of scope (no MV3 side-panel API). Desktop-only.",
      },
    ],
  },
  {
    title: "Pricing & licence",
    items: [
      {
        question: "Is it really free?",
        answer:
          "Yes — free forever, MIT-licensed, no accounts, no paywalls, no trial, no telemetry by default. If you find it useful, the in-panel Contribute panel has optional ways to help (star the repo, share, sponsor).",
      },
      {
        question: "Will it always be free?",
        answer:
          "The extension is MIT-licensed, so even if the maintainer disappears tomorrow, the source stays free. There are no plans to add a paid tier to the extension itself.",
      },
      {
        question: "Can I use Design Mode commercially?",
        answer:
          "Yes — MIT permits commercial use without restriction. Use it at work, on client projects, inside an agency, etc.",
      },
    ],
  },
  {
    title: "MCP & AI coding agents",
    items: [
      {
        question: "What is MCP (Model Context Protocol)?",
        answer:
          "MCP is Anthropic's open standard that lets AI agents safely call external tools. Design Mode exposes six MCP tools so your agent can read every edit you made (get_changes), push patches back to the page (apply_changes), wipe the buffer between iterations (clear_changes), get a high-level summary (get_session_summary), export markdown (export_changes), and grab a screenshot of the current page state (get_screenshot).",
      },
      {
        question: "Which AI coding agents does Design Mode work with?",
        answer:
          "Anything that speaks MCP — Claude Desktop, Claude Code, Cursor, Windsurf, Cline, Continue, Zed, VS Code with the MCP extension, and any custom MCP client. Setup snippets live at /mcp.",
      },
      {
        question: "Does Design Mode work with Claude Code?",
        answer:
          "Yes. Claude Code reads MCP servers from your project's .claude/settings.json under \"mcpServers\". Paste the Cloud or Local snippet from /mcp, restart Claude Code, and the six Design Mode tools become available.",
      },
      {
        question: "Does Design Mode work with Cursor?",
        answer:
          "Yes. Cursor reads MCP servers from ~/.cursor/mcp.json (or the per-project equivalent). The /mcp page has the exact JSON for Cloud, Local, and Self-hosted modes.",
      },
      {
        question: "Does Design Mode work with Windsurf, Cline, Continue, or Zed?",
        answer:
          "Yes — all four are MCP-aware. The JSON shape varies slightly per tool, but the URL + bearer token (or stdio + npx) blocks from /mcp apply directly.",
      },
      {
        question: "What's the difference between Cloud, Local, and Self-hosted modes?",
        answer:
          "Cloud is the no-install default — your agent connects to mcp.designmode.app over HTTPS with a bearer token. Local runs a companion MCP server on your laptop with zero network egress and the lowest latency. Self-hosted is the same Cloud relay code (packages/mcp-cloud) deployed on your own Node.js + Redis infrastructure — Vercel, Railway, Fly, your own VM.",
      },
      {
        question: "Do I have to run a local server?",
        answer:
          "No. Cloud mode is the default and requires no local install. Local mode is opt-in for power users.",
      },
      {
        question: "Can I self-host the relay?",
        answer:
          "Yes — packages/mcp-cloud in the repo deploys to any Node.js host with Redis. Point the extension at your URL, issue your own bearer tokens, done.",
      },
    ],
  },
  {
    title: "Privacy & security",
    items: [
      {
        question: "What data leaves my machine by default?",
        answer:
          "Nothing. The extension stores edits in chrome.storage locally. The Cloud relay is opt-in. Local mode never makes outbound calls. Full disclosure: /privacy.",
      },
      {
        question: "Does Design Mode train on my edits?",
        answer:
          "No. There is no telemetry by default. The Cloud relay does not persist payloads, does not log edit contents, and nothing about your edits is used to train any model — by Design Mode or by any third party.",
      },
      {
        question: "How long does the Cloud relay keep my data?",
        answer:
          "Payload bodies are dropped within roughly 60 seconds — they're transient pass-through, not storage. Token + connection metadata is hashed and logged for abuse prevention only.",
      },
      {
        question: "Where do I report a security issue?",
        answer:
          "Email hello@sandeepbaskaran.com (not a public issue). SECURITY.md in the repo has the disclosure flow.",
      },
    ],
  },
  {
    title: "Comparisons",
    items: [
      {
        question: "Design Mode vs Stagewise?",
        answer:
          "Both target the AI-coding-agent loop. Design Mode is MIT-licensed with a hosted Cloud relay you don't have to run, ships a broader design control set (motion, effects, variants, contrast checker), and includes persistent change history out of the box. Full comparison: /compare/design-mode-vs-stagewise.",
      },
      {
        question: "Design Mode vs Figma Dev Mode?",
        answer:
          "Figma Dev Mode reads a static design file; Design Mode edits the live deployed page. Pair them: design in Figma, refine on the rendered page in Design Mode. Full comparison: /compare/design-mode-vs-figma-dev-mode.",
      },
      {
        question: "Design Mode vs Builder.io Visual Copilot or Locofy?",
        answer:
          "Those tools generate code from a Figma file. Design Mode goes the other direction: tweak the live page, hand the agent precise CSS deltas. Different problem, different fit.",
      },
      {
        question: "Design Mode vs VisBug?",
        answer:
          "VisBug edits the live page but has no agent / MCP handoff, no persistent change history, and a narrower design control set.",
      },
    ],
  },
  {
    title: "Workflows",
    items: [
      {
        question: "Can I use Design Mode for UI testing and bug reports?",
        answer:
          "Yes — QA testers and designers walk a staging URL, annotate broken layout / contrast / copy / spacing, and export the structured diff (selector → property → value) into Linear, GitHub, or Jira. Developers see the exact change to make, not a vague screenshot. See /use-cases/ui-testing-export-to-developers.",
      },
      {
        question: "Can content people use it to fix microcopy without a PR?",
        answer:
          "Yes. Edit the copy in the live page, export the diff, send it to engineering. No Figma round-trip, no Slack screenshot. See /use-cases/copy-edits-without-a-pr.",
      },
      {
        question: "Can I do accessibility audits with it?",
        answer:
          "Yes. The colour picker has a WCAG contrast checker, you can bump text sizes visually, and you can fix focus states with the inspector. Export the diff for the a11y backlog. See /use-cases/accessibility-quick-fixes.",
      },
    ],
  },
  {
    title: "Contributing & support",
    items: [
      {
        question: "Can I contribute?",
        answer:
          "Yes. CONTRIBUTING.md in the repo has the contributor flow. Easy first issues are tagged on GitHub; bigger changes start in a Discussion or a draft PR.",
      },
      {
        question: "How do I report a bug?",
        answer:
          "Open the Help panel inside the extension (? icon in the side-panel header) → click Copy diagnostics → file an issue on GitHub with the pasted diagnostics, repro steps, and what you expected.",
      },
      {
        question: "Where do I get troubleshooting help?",
        answer:
          "/docs/troubleshooting covers the most common issues (panel won't open, MCP not connecting, edits not persisting). GitHub Discussions is the place for everything else.",
      },
    ],
  },
];

const flatQA = groups.flatMap((g) => g.items);

export default function FaqPage() {
  return (
    <>
      <JsonLd data={faqSchema(flatQA)} />
      <Background>
        <section className="py-28 lg:py-32 lg:pt-44">
          <div className="container max-w-5xl">
            <h1 className="text-3xl tracking-tight sm:text-4xl md:text-5xl">
              Frequently asked questions
            </h1>
            <p className="text-muted-foreground mt-4 max-w-3xl text-lg md:text-xl">
              Everything about Design Mode — installation, MCP setup,
              compatible AI coding agents, privacy, comparisons, and
              contributing. Can&apos;t find what you&apos;re looking for?{" "}
              <Link
                href="/contact"
                className="text-foreground underline underline-offset-4"
              >
                Get in touch
              </Link>
              .
            </p>
          </div>
        </section>
      </Background>

      <section className="py-16 lg:py-20">
        <DashedLine className="container max-w-5xl" />
        <div className="container mt-12 max-w-5xl space-y-12">
          {groups.map((group, gi) => (
            <div key={group.title}>
              <h2 className="text-foreground border-b pb-3 text-xl font-semibold tracking-tight md:text-2xl">
                {group.title}
              </h2>
              <Accordion type="single" collapsible className="mt-2 w-full">
                {group.items.map((qa, i) => (
                  <AccordionItem key={i} value={`${gi}-${i}`}>
                    <AccordionTrigger className="text-left">
                      {qa.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground leading-relaxed">
                      {qa.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          ))}
        </div>

        <RelatedLinks
          title="Related"
          links={[
            {
              href: "/mcp",
              title: "MCP setup",
              description: "Connect Claude Code, Cursor, Windsurf, and more.",
            },
            {
              href: "/use-cases",
              title: "Use cases",
              description:
                "Workflows for designers, developers, QA, PMs, vibe coders.",
            },
            {
              href: "/compare",
              title: "Comparisons",
              description:
                "Honest side-by-sides vs DevTools, Stagewise, Figma Dev Mode, and more.",
            },
            {
              href: "/docs",
              title: "Docs",
              description:
                "Install, keyboard shortcuts, MCP setup, Changes tab, troubleshooting.",
            },
            {
              href: "/privacy",
              title: "Privacy",
              description: "What leaves your machine, when, and why.",
            },
            {
              href: "/blog",
              title: "Blog",
              description:
                "Stories from the build and walkthroughs of real workflows.",
            },
          ]}
        />
      </section>
    </>
  );
}
