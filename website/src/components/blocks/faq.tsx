import Link from "next/link";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type QA = { question: string; answer: string };

const categories: Array<{ title: string; questions: QA[] }> = [
  {
    title: "Getting started",
    questions: [
      {
        question: "What is Design Mode?",
        answer:
          "Design Mode is a free, open-source Chrome extension that turns any live website into a visual design surface. Click any element on any page and edit its layout, typography, colour, spacing, copy, or DOM with real controls — then ship the diff to your AI coding agent over Model Context Protocol (MCP).",
      },
      {
        question: "Is it really free?",
        answer:
          "Yes — free forever, MIT-licensed, no accounts, no paywalls, no telemetry by default. If you find it valuable, the in-panel Contribute panel has ways to help (Star the repo, share, sponsor) but none of them are required.",
      },
      {
        question: "Which browsers does it work in?",
        answer:
          "Any Chromium-based browser that supports Manifest V3 side panels — Chrome, Edge, Arc, Brave. Firefox is not supported today. Safari is out of scope (no MV3 side-panel API). It's also a desktop-only experience — touch-only mobile devices won't have a place to anchor the side panel.",
      },
      {
        question: "Is Design Mode for designers or developers?",
        answer:
          "Both — plus QA testers, product managers, content / marketing teams, indie hackers, agencies, and vibe coders. The shared surface is: edit the live page visually, then ship a precise diff to whoever (or whatever AI agent) writes the code.",
      },
    ],
  },
  {
    title: "Privacy & data",
    questions: [
      {
        question: "What data leaves my machine?",
        answer:
          "By default, nothing. The extension stores your edits in chrome.storage locally. The optional MCP server runs on localhost. The hosted Cloud relay (mcp.designmode.app) is opt-in — you only use it if you explicitly enable Cloud mode and register a bearer token. Full breakdown: see /privacy.",
      },
      {
        question: "How does the Cloud relay work?",
        answer:
          "It's a thin SSE pass-through. Your edits flow from the extension to your AI agent through it. We hash and log the token + connection metadata for abuse prevention, drop payload bodies within ~60 seconds, never persist edits, and never train on the traffic. The full PRIVACY.md doc has the exact list.",
      },
      {
        question: "Does Design Mode train on my edits?",
        answer:
          "No. There is no telemetry by default. The Cloud relay does not persist payloads and nothing about your edits is used to train any model — by Design Mode or by any third party.",
      },
    ],
  },
  {
    title: "Agents & MCP",
    questions: [
      {
        question: "Which AI coding agents does it work with?",
        answer:
          "Anything that speaks MCP (Model Context Protocol) — Claude Desktop, Claude Code, Cursor, Windsurf, Cline, Continue, Zed, and the growing list of MCP-aware tools. Setup configs for the major ones live on the /mcp page.",
      },
      {
        question: "Does it work with Claude Code?",
        answer:
          "Yes. Claude Code reads MCP servers from your project's .claude/settings.json. Paste the snippet from the /mcp page under \"mcpServers\" and restart Claude Code.",
      },
      {
        question: "Does it work with Cursor?",
        answer:
          "Yes. Cursor reads MCP servers from ~/.cursor/mcp.json (or the per-project equivalent). The /mcp page has the exact JSON for Cloud, Local, and Self-hosted modes.",
      },
      {
        question: "Do I need to run a local server?",
        answer:
          "No. The Cloud mode is the default — your agent dials the hosted relay over HTTPS with a bearer token, no install required. Local mode is for power users who want offline + lowest latency. Self-hosted is for teams who want the Cloud ergonomics on their own infrastructure.",
      },
      {
        question: "Can I self-host the relay?",
        answer:
          "Yes — packages/mcp-cloud in the repo deploys to any Node.js host with Redis (Vercel, Railway, Fly, your own VM — your call). Self-hosted mode is one of the three connection modes on the /mcp page.",
      },
    ],
  },
  {
    title: "Workflow & comparisons",
    questions: [
      {
        question: "How is this different from Chrome DevTools?",
        answer:
          "Chrome DevTools is a developer inspector — edits don't persist across reloads, there's no design surface (sliders, colour pickers, motion controls), and there's no handoff to an AI agent. Design Mode is built for design intent first: persistent change history, real visual controls, and a one-click ship-to-agent over MCP.",
      },
      {
        question: "Can I use Design Mode for UI testing and bug reports?",
        answer:
          "Yes — that's one of the most popular workflows. QA testers and designers walk a staging URL, annotate broken layout / contrast / copy, and export the structured diff (selector → property → value) into Linear, GitHub, or Jira. Developers see the exact change to make, not a vague screenshot. See /use-cases/ui-testing-export-to-developers.",
      },
      {
        question: "Does it replace Figma?",
        answer:
          "No — they pair. Figma is great for greenfield, file-based design. Design Mode is great for editing the live deploy, the staging URL, or any page on the open web. Many teams use both: design system in Figma, day-to-day production tweaks in Design Mode.",
      },
    ],
  },
  {
    title: "Contributing & support",
    questions: [
      {
        question: "Can I contribute?",
        answer:
          "Yes. The CONTRIBUTING.md doc has the contributor flow. Easy first issues are tagged on GitHub; bigger changes start in a Discussion or a draft PR. Security issues should be emailed (not filed publicly) — see /privacy.",
      },
      {
        question: "How do I report a bug?",
        answer:
          "Open the Help panel inside the extension (? icon in the side-panel header) → click Copy diagnostics → file an issue on GitHub with the pasted diagnostics, repro steps, and what you expected. The issue template walks you through it.",
      },
    ],
  },
];

export const homepageFaqQA: QA[] = categories.flatMap((c) => c.questions);

export const FAQ = () => {
  return (
    <section className="py-28 lg:py-32">
      <div className="container max-w-6xl">
        <div className="mb-12 space-y-4 text-center lg:mb-16">
          <h2 className="text-2xl tracking-tight md:text-4xl lg:text-5xl">
            Frequently asked questions
          </h2>
          <p className="text-muted-foreground mx-auto w-fit max-w-[840px] leading-snug">
            Can't find what you're looking for? See the{" "}
            <Link href="/faq" className="underline underline-offset-4">
              full FAQ
            </Link>{" "}
            or{" "}
            <Link href="/contact" className="underline underline-offset-4">
              get in touch
            </Link>
            .
          </p>
        </div>

        <div className="grid grid-cols-1 gap-x-12 gap-y-8 md:grid-cols-2">
          {categories.map((category, categoryIndex) => (
            <div key={category.title}>
              <h3 className="text-muted-foreground border-b py-4">
                {category.title}
              </h3>
              <Accordion type="single" collapsible className="w-full">
                {category.questions.map((item, i) => (
                  <AccordionItem key={i} value={`${categoryIndex}-${i}`}>
                    <AccordionTrigger>{item.question}</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      {item.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
