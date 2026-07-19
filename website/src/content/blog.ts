export type BlogPost = {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  datePublished: string;
  excerpt: string;
  body: { heading?: string; paragraphs: string[] }[];
  related: string[];
};

export const posts: BlogPost[] = [
  {
    slug: "why-we-built-an-mcp-server-for-design-edits",
    title: "Why we built an MCP server for design edits",
    metaTitle:
      "Why we built an MCP server for design edits — Design Mode's origin story",
    metaDescription:
      "The story behind Design Mode's MCP integration: how visual design edits got first-class agent handoff, why MCP was the right protocol, and the three-mode (Cloud / Local / Self-hosted) architecture.",
    keywords: [
      "MCP server",
      "Model Context Protocol",
      "design MCP",
      "Design Mode origin",
      "AI agent design tool",
    ],
    datePublished: "2026-03-12",
    excerpt:
      "The first version of Design Mode shipped a clipboard button. The second version shipped MCP — and changed how the loop felt.",
    body: [
      {
        paragraphs: [
          "Design Mode shipped its first version with a single handoff button: Copy Prompt. It dumped a Markdown export of your changes into the clipboard, you pasted it into Claude, Cursor, or whatever, and an agent picked it up from there. It worked. But it was clunky — context-switch, paste, switch back.",
          "When Anthropic released Model Context Protocol in late 2024, it was obvious in retrospect what the right surface was. MCP is a standard for letting agents call tools. A design edit is a tool call. Match made.",
        ],
      },
      {
        heading: "Why MCP and not a custom protocol",
        paragraphs: [
          "We could have built a bespoke WebSocket protocol and an SDK per agent. We didn't, because MCP solved three problems for free: every major coding agent already speaks it, the auth and transport story is settled, and the user's mental model is the same regardless of which agent they pick.",
          "MCP is also one of the rare protocols designed by an AI lab that respects the principle of least privilege. The agent only gets the six tools we expose. It doesn't get filesystem, it doesn't get the network, it doesn't get to do anything we didn't sign up for.",
        ],
      },
      {
        heading: "Three connection modes",
        paragraphs: [
          "We launched Local mode first — a stdio MCP server you run on your laptop. Zero network egress, lowest latency, best for power users. But Local mode has a steep on-ramp: you have to be comfortable with terminal commands and your agent has to be on the same machine.",
          "Cloud mode came next. It's a hosted SSE relay at mcp.designmode.app. Your agent dials it over HTTPS with a bearer token. Nothing persists; payload bodies are dropped within ~60 seconds. The on-ramp is one paste of a config block — no install required.",
          "Self-hosted mode is the same Cloud relay code (packages/mcp-cloud) deployed on infrastructure you operate. For teams who want Cloud ergonomics but their own infra.",
        ],
      },
      {
        heading: "What changed in the loop",
        paragraphs: [
          "Before MCP, sending edits felt like a tax. After MCP, it became the natural end of a design iteration. You tweak something in the side panel; you hit Send to Agent; the agent writes the production code. The loop stopped being three tools and three context-switches.",
          "If you're building any kind of agent-facing tool, MCP is now the answer. The standard is settled enough to bet on, and the user experience compounds across every agent your users already have installed.",
        ],
      },
    ],
    related: [
      "vibe-coding-visual-editing-workflow",
      "redesigning-a-tailwind-landing-page-with-claude-code",
    ],
  },
  {
    slug: "vibe-coding-visual-editing-workflow",
    title: "Vibe coding: how visual editing fits into the AI-coding-agent workflow",
    metaTitle:
      "Vibe coding workflow — visual editing + Claude Code / Cursor / Windsurf",
    metaDescription:
      "A practical guide to vibe coding: how visual editing on the live page closes the design-intent gap with AI coding agents like Claude Code, Cursor, Windsurf, and Cline.",
    keywords: [
      "vibe coding",
      "vibe coding workflow",
      "AI coding agent design",
      "Claude Code workflow",
      "Cursor workflow",
      "visual editing AI",
    ],
    datePublished: "2026-04-05",
    excerpt:
      "Vibe coding is what happens when you describe a UI change to an AI agent and ship the result. Visual editing is what makes the loop tight.",
    body: [
      {
        paragraphs: [
          "Vibe coding is a meme that turned into a real practice. The idea: you describe a UI change to an AI coding agent in plain English, the agent writes the code, you ship. Coined by Andrej Karpathy in early 2025; widely adopted by indie hackers, design engineers, and anyone tired of writing CSS by hand.",
          "The catch is that vibe coding only feels good when the agent gets your intent right on the first try. Otherwise you spend the same time you would have writing CSS — except now you're prompt-engineering instead of coding. That's a worse trade.",
        ],
      },
      {
        heading: "The intent gap",
        paragraphs: [
          "AI coding agents are great at writing CSS once they know what you want. The bottleneck is conveying what you want. Three options today:",
          "1. Screenshots. Lossy. Ambiguous about which property changed. Doesn't work for hover states, animations, or pixel-level work.",
          "2. Figma mockups. High-fidelity, but maintaining a Figma file that matches production is its own job. Indie hackers don't have time.",
          "3. Prose descriptions. \"Make the hero pop more.\" \"Tighten the spacing.\" Imprecise, slow, error-prone.",
          "Visual editing on the live page is a fourth option: tweak the real rendered surface, capture a structured diff, hand it to the agent.",
        ],
      },
      {
        heading: "What the loop looks like",
        paragraphs: [
          "Open the page you're iterating on in Chrome. Open Design Mode's side panel. Make the change visually — drag a handle, pick a colour, adjust spacing. Every edit lands in the Changes tab as a structured row: selector, property, before, after.",
          "Send to Agent. Claude Code / Cursor / Windsurf / Cline reads the diff via MCP, finds the source file, and writes the production change. You review, you ship.",
          "The loop is fast because the spec is exact. The agent isn't guessing what \"more breathing room\" means; it has a literal `padding-block: 24px` to write.",
        ],
      },
      {
        heading: "Where it doesn't work",
        paragraphs: [
          "Greenfield UI from scratch — Design Mode needs a page to edit. For brand-new components, Figma + AI generators are still better.",
          "Pure logic changes — Design Mode is for visual surface. \"Fix this race condition\" is a job for the agent alone.",
          "Anywhere your design system mandates specific tokens and the agent can't infer them — pair Design Mode with a CONTRIBUTING.md that names the token system, and Claude Code will reach for the right utility classes.",
        ],
      },
    ],
    related: [
      "why-we-built-an-mcp-server-for-design-edits",
      "redesigning-a-tailwind-landing-page-with-claude-code",
    ],
  },
  {
    slug: "design-mode-1-5-0-changelog-deep-dive",
    title: "Design Mode 1.5.0 — changelog deep-dive",
    metaTitle:
      "Design Mode 1.5.0 changelog deep-dive — margin overlays, file size, WCAG contrast",
    metaDescription:
      "What shipped in Design Mode 1.5.0: margin/padding overlay bands, file size next to resolution in the Media section, the WCAG contrast checker in the colour picker, and the static OG image.",
    keywords: [
      "Design Mode 1.5.0",
      "Design Mode changelog",
      "Design Mode release notes",
      "WCAG contrast checker",
      "margin padding overlay",
    ],
    datePublished: "2026-05-15",
    excerpt:
      "Margin/padding overlay bands, a WCAG contrast checker in the colour picker, file-size hints in Media, and the static OG image migration.",
    body: [
      {
        paragraphs: [
          "Design Mode 1.5.0 is a small-features-only release. No protocol changes, no breaking changes — just quality-of-life upgrades that compound the daily loop.",
        ],
      },
      {
        heading: "Margin & padding overlay bands",
        paragraphs: [
          "The selection overlay now draws coloured bands for margin and padding. Previously you had to mentally subtract content-box from border-box to figure out spacing. Now it's directly visible on the canvas, colour-keyed to the design tokens in Settings.",
          "The bands respect the overlay colours you set in Settings, so they match the rest of your inspector palette. Default colours follow the Figma convention (greenish for padding, orange-ish for margin), but every overlay colour is now configurable.",
        ],
      },
      {
        heading: "File size next to resolution in Media",
        paragraphs: [
          "When you select an image, the Media section now shows file size alongside resolution. Useful for catching unoptimized assets during design review — \"that's a 4 MB JPG\" is a faster diagnosis than waiting for Lighthouse to flag it.",
        ],
      },
      {
        heading: "WCAG contrast checker in the colour picker",
        paragraphs: [
          "The colour picker now displays the WCAG 2.2 contrast ratio against the inferred background colour, with AA / AAA tags. The check happens live as you drag — pick a colour that fails, see the failure immediately.",
          "Not a replacement for a full a11y audit, but a fast way to avoid shipping low-contrast text in the first place.",
        ],
      },
      {
        heading: "Static OG image",
        paragraphs: [
          "The marketing site now uses a single static og-image.png across every page. The dynamic per-page OG generation that some of the templates ship with was costing edge function invocations for no measurable benefit; one well-designed static image is enough.",
        ],
      },
      {
        heading: "What's next",
        paragraphs: [
          "1.6 is in flight. Expected: a fuller Variants section (responsive breakpoints in the Design tab), a new export format for Linear, and a longer-term experiment with a Figma sync mode. Track progress on GitHub.",
        ],
      },
    ],
    related: [
      "why-we-built-an-mcp-server-for-design-edits",
      "vibe-coding-visual-editing-workflow",
    ],
  },
  {
    slug: "redesigning-a-tailwind-landing-page-with-claude-code",
    title: "Hands-on: redesigning a Tailwind landing page with Claude Code",
    metaTitle:
      "Redesigning a Tailwind landing page with Claude Code and Design Mode",
    metaDescription:
      "A walkthrough of redesigning a Tailwind landing page using Design Mode for visual edits and Claude Code (over MCP) to write the production utility classes.",
    keywords: [
      "Tailwind redesign",
      "Tailwind + Claude Code",
      "redesign with AI",
      "vibe coding Tailwind",
      "Tailwind visual editor",
    ],
    datePublished: "2026-05-20",
    excerpt:
      "A concrete walkthrough: take an OK-looking Tailwind landing page, redesign it visually, and let Claude Code commit every Tailwind utility class update over MCP.",
    body: [
      {
        paragraphs: [
          "Tailwind landing pages all start to look the same — same hero, same three-column features, same testimonial section. Refining one to actually feel custom is hours of class-tweaking. This is a walkthrough of doing it in roughly an hour using Design Mode + Claude Code.",
        ],
      },
      {
        heading: "Setup",
        paragraphs: [
          "Open the landing page on localhost or staging. Open the Design Mode side panel. Wire Claude Code's MCP config to Design Mode's Cloud mode (paste from /mcp). Confirm the MCP status chip is connected.",
        ],
      },
      {
        heading: "Hero",
        paragraphs: [
          "Start with the headline. Adjust the type size visually until it feels right — drag the slider, see the rendered size, settle. Pick the colour with the colour picker; the WCAG contrast indicator confirms it passes AA on the gradient background.",
          "Adjust hero padding using the visual spacing controls. Drop the hero image's `border-radius` from `1rem` to `0.75rem`. Every edit lands in the Changes tab.",
        ],
      },
      {
        heading: "Send to Claude Code",
        paragraphs: [
          "Hit Send to Agent. Claude Code reads the diff via MCP, finds the JSX file, and rewrites the utility classes. Type sizes become the nearest Tailwind step (`text-5xl` or a custom value via arbitrary), colours map to your design tokens if `tailwind.config.ts` lists them, spacing snaps to the nearest `space-y-*` or `gap-*`.",
          "Review the diff in Claude Code's chat. Accept. Commit.",
        ],
      },
      {
        heading: "Sections",
        paragraphs: [
          "Repeat for the features section, the testimonial section, the CTA. Each section is a 5-minute loop. Total elapsed: about 45 minutes for a meaningful redesign across five sections.",
        ],
      },
      {
        heading: "The pattern",
        paragraphs: [
          "Visual control of a utility-class UI without leaving the rendered page. Your design tokens are respected (Claude Code reads `tailwind.config.ts`). The git diff is clean — utility class changes only, no inline styles. The loop fits in your existing branch.",
        ],
      },
    ],
    related: [
      "vibe-coding-visual-editing-workflow",
      "why-we-built-an-mcp-server-for-design-edits",
    ],
  },
  {
    slug: "design-mode-1-9-0-release",
    title: "Design Mode 1.9.0 — design tokens, trigger-first motion, and a dedicated MCP page",
    metaTitle:
      "Design Mode 1.9.0 changelog deep-dive — design-system tokens, trigger-first motion, dedicated MCP page",
    metaDescription:
      "What shipped in Design Mode 1.9.0: a design-system-aware token engine with swap/edit/detach badges, trigger-first Motion interaction cards, a dedicated in-extension MCP page, a step-based Send to Agent modal, and a Select matching layers checkbox.",
    keywords: [
      "Design Mode 1.9.0",
      "Design Mode changelog",
      "Design Mode release notes",
      "design system tokens",
      "trigger-first motion",
      "MCP page",
    ],
    datePublished: "2026-07-19",
    excerpt:
      "A token engine that understands design systems, Motion rebuilt around triggers instead of raw CSS properties, and MCP configuration moved out of Settings into its own page.",
    body: [
      {
        paragraphs: [
          "Design Mode 1.9.0 is the biggest release since MCP shipped. Three systems got rebuilt from the ground up — tokens, Motion, and the agent handoff — plus a handful of smaller fixes that had been on the list for a while.",
        ],
      },
      {
        heading: "Design-system aware tokens",
        paragraphs: [
          "Token discovery moved to a single engine that finds every CSS custom property a page declares, not just the ones on :root. Theme scopes, component scopes, matching @media/@supports blocks, and cascade layers are all picked up — on a Carbon Design System page that's the difference between finding no tokens and finding roughly 660 of them.",
          "Recognised systems — IBM Carbon, Material, MUI, Bootstrap, Polaris, Radix, shadcn/ui, and Tailwind v4 — get labelled by name, and any Design-tab field authored from a variable now shows a ◆ badge. Click it for Swap token… (colour, spacing, radius, typography, and shadow all get a matched picker now, not just colour), Edit token globally, or Detach from token.",
          "Because a token is one value per theme, edits write into a managed override stylesheet scoped to wherever the element actually resolves the token, instead of a single inline override that a theme scope's own rule would just beat. The agent side gets the same context: get_changes now carries tokenChanges with the scope and system, and the /design-mode workflow tells the agent to edit the token's definition, not restyle the component.",
        ],
      },
      {
        heading: "Motion, trigger-first",
        paragraphs: [
          "Motion used to be a list of raw CSS editors — Transition, Animation, Transform. Useful, but it made you translate 'fade in on hover' into property names yourself. The Motion section now leads with interaction cards keyed by trigger: Hover, Press, and Focus animate to a target state; Appear animates from a start state on mount via @starting-style; Loop plays an infinite keyframe; Scroll drives an animation-timeline: view().",
          "Each card has change presets (Fade, Lift, Scale, Background), a shared easing Curve, a plain-English summary, and a Preview button that actually plays the interaction. The raw per-property editors didn't go away — they moved under Motion → Advanced for anyone who wants a specific CSS longhand.",
        ],
      },
      {
        heading: "A dedicated MCP page",
        paragraphs: [
          "MCP configuration — connection mode, port, auto-connect, token/tenant, Copy config / Copy token / Revoke — moved out of Settings into its own full-panel page, opened from the header MCP chip. Settings was getting crowded, and MCP setup is a distinct enough task (and one people revisit more than the rest of Settings) to earn its own screen.",
        ],
      },
      {
        heading: "Step-based Send to Agent, and a real handoff signal",
        paragraphs: [
          "Send to Agent is now a guided, step-based modal instead of a single click into the void. And on the protocol side, get_changes and get_session_summary expose a real handoff field once you send — an explicit 'these are ready' signal the agent can key off, instead of inferring intent from whatever's sitting in the change buffer.",
        ],
      },
      {
        heading: "Select matching layers",
        paragraphs: [
          "The similarity wand and threshold slider are gone, replaced by a Select matching layers checkbox in the indicator chip's Selected row. Tick it and every layer matching the same tag/class as your current selection joins it — same outcome, fewer moving parts.",
        ],
      },
      {
        heading: "Everything else",
        paragraphs: [
          "Layers tab rows no longer scroll horizontally on long names. Appearance's opacity and corner-radius fields are icon-led now, with blend mode and isolation moved into Advanced. Layout guides gained visibility gating so the section-level eye only shows up once you actually have more than one guide. And the whole panel picked up a Figma-aligned light/dark palette to cut down on visual noise.",
        ],
      },
    ],
    related: [
      "why-we-built-an-mcp-server-for-design-edits",
      "design-mode-1-5-0-changelog-deep-dive",
    ],
  },
];

export function getPost(slug: string): BlogPost | undefined {
  return posts.find((p) => p.slug === slug);
}
