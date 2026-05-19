import Link from "next/link";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const categories = [
  {
    title: "Getting started",
    questions: [
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
    ],
  },
  {
    title: "Agents & MCP",
    questions: [
      {
        question: "Which AI coding agents does it work with?",
        answer:
          "Anything that speaks MCP (Model Context Protocol) — Claude Desktop, Cursor, Claude Code, Windsurf, and the growing list of MCP-aware tools. Setup configs for the major ones live on the /mcp page.",
      },
      {
        question: "Can I self-host the relay?",
        answer:
          "Yes — packages/mcp-cloud in the repo deploys to any Node.js host with Redis (Vercel, Railway, Fly, your own VM — your call). Self-hosted mode is one of the three connection modes on the /mcp page.",
      },
    ],
  },
  {
    title: "Contributing",
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

export const FAQ = () => {
  return (
    <section className="py-28 lg:py-32">
      <div className="container max-w-6xl">
        <div className="mb-12 space-y-4 text-center lg:mb-16">
          <h2 className="text-2xl tracking-tight md:text-4xl lg:text-5xl">
            Frequently asked questions
          </h2>
          <p className="text-muted-foreground mx-auto max-w-md leading-snug">
            If you can't find what you're looking for,{" "}
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
