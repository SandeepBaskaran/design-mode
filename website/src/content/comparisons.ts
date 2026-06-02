export type ComparisonRow = {
  feature: string;
  designMode: string;
  competitor: string;
};

export type Comparison = {
  slug: string;
  competitor: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  oneLiner: string;
  positioning: string;
  whenToPickDesignMode: string[];
  whenToPickCompetitor: string[];
  table: ComparisonRow[];
  honesty: string;
  related: string[];
};

const baseFeatures = (competitorBlanks: Record<string, string>): ComparisonRow[] => [
  {
    feature: "Visual editing of any live website",
    designMode: "Yes — full design surface (typography, colour, layout, spacing, motion, effects)",
    competitor: competitorBlanks.editing ?? "Partial / inspection-only",
  },
  {
    feature: "MCP (Model Context Protocol) handoff to AI agents",
    designMode:
      "Yes — Cloud, Local, and Self-hosted modes; six MCP tools",
    competitor: competitorBlanks.mcp ?? "No",
  },
  {
    feature: "Persistent change history (Changes tab)",
    designMode: "Yes — searchable, filterable, exportable",
    competitor: competitorBlanks.history ?? "No",
  },
  {
    feature: "Open source",
    designMode: "Yes (MIT)",
    competitor: competitorBlanks.os ?? "No / proprietary",
  },
  {
    feature: "Price",
    designMode: "Free forever",
    competitor: competitorBlanks.price ?? "—",
  },
  {
    feature: "Markdown / JSON export of the diff",
    designMode: "Yes",
    competitor: competitorBlanks.export ?? "No",
  },
  {
    feature: "Best fit for",
    designMode:
      "Designers, developers, QA, PMs, content, indie hackers, agencies, vibe coders",
    competitor: competitorBlanks.fit ?? "—",
  },
];

export const comparisons: Comparison[] = [
  {
    slug: "design-mode-vs-stagewise",
    competitor: "Stagewise",
    title: "Design Mode vs Stagewise",
    metaTitle:
      "Design Mode vs Stagewise — open-source visual editor with MCP",
    metaDescription:
      "Honest comparison: Design Mode and Stagewise both ship visual edits to AI coding agents. Design Mode is MIT-licensed with a hosted Cloud relay, broader design controls, and built-in change history.",
    keywords: [
      "Design Mode vs Stagewise",
      "Stagewise alternative",
      "Stagewise comparison",
      "visual editor for AI agents",
      "MCP design tool",
    ],
    oneLiner:
      "Stagewise is the closest direct competitor — both target the AI-coding-agent design loop.",
    positioning:
      "Both tools target the same pain point: getting design intent from a live page into your AI coding agent. The differences come down to licensing, hosting, design control depth, and how change history is handled.",
    whenToPickDesignMode: [
      "You want MIT open source with no licensing risk.",
      "You don't want to run your own relay — Cloud mode is hosted at mcp.designmode.app.",
      "You need a broader design control set (motion, effects, variants, contrast checker).",
      "You want persistent, searchable change history in a Changes tab.",
      "You want use-case-specific workflows beyond developer-focused editing (UI testing, copy edits, design system audits).",
    ],
    whenToPickCompetitor: [
      "You're already deep in Stagewise's ecosystem and tooling.",
      "Stagewise's specific UX matches your team's mental model better.",
    ],
    table: baseFeatures({
      editing: "Yes — developer-focused visual editing",
      mcp: "Yes",
      history: "Limited",
      os: "Check current licence",
      price: "Check current pricing",
      export: "Partial",
      fit: "Developers using AI coding agents",
    }),
    honesty:
      "Stagewise is genuinely good and was earlier to this space. If you're happy with it, stay with it. Design Mode's case is breadth: it covers personas (QA, PMs, content, design system maintenance) Stagewise doesn't centre.",
    related: [
      "design-mode-vs-cursor-design-mode",
      "design-mode-vs-pls-fix",
      "design-mode-vs-chrome-devtools",
    ],
  },
  {
    slug: "design-mode-vs-pls-fix",
    competitor: "pls-fix",
    title: "Design Mode vs pls-fix",
    metaTitle:
      "Design Mode vs pls-fix — visual editor vs comment-pin bug tool",
    metaDescription:
      "Comparison: pls-fix is a comment-pin tool for filing visual bugs. Design Mode covers comment pins plus full visual editing, MCP handoff, persistent change history, and exports.",
    keywords: [
      "Design Mode vs pls-fix",
      "pls-fix alternative",
      "visual bug report tool",
      "comment pin tool",
      "design feedback tool",
    ],
    oneLiner:
      "pls-fix focuses on comment-pinning bugs. Design Mode covers comments plus full visual editing, MCP handoff, and structured exports.",
    positioning:
      "pls-fix is a specialised tool for filing visual bug reports with annotations. Design Mode is a broader design surface — comment pins are one feature among many (Layers tree, Design controls, Changes tab, MCP).",
    whenToPickDesignMode: [
      "You want to fix the bug, not just annotate it.",
      "You want to ship the structured diff to an AI agent.",
      "You want one tool for designers, developers, QA, PMs, and content.",
    ],
    whenToPickCompetitor: [
      "All you need is comment pins on screenshots.",
      "You don't need to edit the page itself.",
    ],
    table: baseFeatures({
      editing: "Comment / pin only",
      mcp: "No",
      history: "Per-comment threads",
      os: "Check current licence",
      price: "Check current pricing",
      export: "Comments / links",
      fit: "Bug reporting & feedback",
    }),
    honesty:
      "If you only need to pin comments on a deployed page, pls-fix is purpose-built. If you also want to make the fix, ship the spec to engineering, or run a full design review, Design Mode covers more ground.",
    related: [
      "design-mode-vs-ui-inspector",
      "design-mode-vs-hover-inspector",
      "design-mode-vs-stagewise",
    ],
  },
  {
    slug: "design-mode-vs-agentation",
    competitor: "Agentation",
    title: "Design Mode vs Agentation",
    metaTitle:
      "Design Mode vs Agentation — open-source visual editor for AI agents",
    metaDescription:
      "Comparison: Agentation focuses on AI agent integration; Design Mode adds a full visual design surface, three MCP modes, and a broader persona fit.",
    keywords: [
      "Design Mode vs Agentation",
      "Agentation alternative",
      "AI agent design tool",
      "visual editor for AI agents",
    ],
    oneLiner:
      "Both tools wire visual edits into AI coding agents — Design Mode adds an open-source design surface, three MCP connection modes, and use-case-specific workflows.",
    positioning:
      "Agentation centres the agent integration; Design Mode centres the design tool that happens to integrate with agents. Different starting points; overlapping outcomes.",
    whenToPickDesignMode: [
      "You want MIT open source.",
      "You need a richer visual control set (motion, effects, contrast checker).",
      "You want three connection modes (Cloud / Local / Self-hosted) instead of a single hosted path.",
    ],
    whenToPickCompetitor: [
      "Agentation's specific agent UX matches your team better.",
    ],
    table: baseFeatures({
      editing: "Yes — agent-focused editing",
      mcp: "Yes",
      history: "Per-session",
      os: "Check current licence",
      price: "Check current pricing",
      export: "Partial",
      fit: "AI-coding-agent users",
    }),
    honesty:
      "We track Agentation's roadmap — it's a real competitor. Pick whichever fits your editing UX and licensing constraints.",
    related: [
      "design-mode-vs-stagewise",
      "design-mode-vs-dialkit",
      "design-mode-vs-cursor-design-mode",
    ],
  },
  {
    slug: "design-mode-vs-dialkit",
    competitor: "Dialkit",
    title: "Design Mode vs Dialkit",
    metaTitle:
      "Design Mode vs Dialkit — comparison for live website editing",
    metaDescription:
      "Comparison: Dialkit and Design Mode are both browser-based design tools. Design Mode adds MCP handoff to AI coding agents and a full Changes-tab history.",
    keywords: [
      "Design Mode vs Dialkit",
      "Dialkit alternative",
      "browser design tool",
      "live editing tool",
    ],
    oneLiner:
      "Both are browser-based visual editors. Design Mode's differentiator is the MCP handoff and the persistent, exportable change history.",
    positioning:
      "Dialkit and Design Mode share the in-browser editing premise. The fork in the road is what you do with the edits — Design Mode treats them as a structured diff to ship to engineering or an AI agent.",
    whenToPickDesignMode: [
      "You want to hand edits to Claude Code, Cursor, or any MCP agent.",
      "You need a Changes tab with search, filter, and export.",
      "You want an MIT-licensed tool.",
    ],
    whenToPickCompetitor: [
      "Dialkit's specific UX or integrations match your stack better.",
    ],
    table: baseFeatures({
      editing: "Yes",
      mcp: "No / Limited",
      history: "Limited",
      os: "Check current licence",
      price: "Check current pricing",
      export: "Limited",
      fit: "Designers / developers editing in-browser",
    }),
    honesty:
      "If you don't need AI agent handoff, Dialkit and Design Mode are both reasonable choices. If you do, Design Mode's three MCP modes are the deciding factor.",
    related: [
      "design-mode-vs-agentation",
      "design-mode-vs-stagewise",
      "design-mode-vs-ui-inspector",
    ],
  },
  {
    slug: "design-mode-vs-ui-inspector",
    competitor: "UI Inspector",
    title: "Design Mode vs UI Inspector",
    metaTitle:
      "Design Mode vs UI Inspector — design surface vs inspection tool",
    metaDescription:
      "Comparison: UI Inspector tools focus on reading CSS off live pages. Design Mode reads, edits, exports, and ships to AI agents over MCP.",
    keywords: [
      "Design Mode vs UI Inspector",
      "UI Inspector alternative",
      "Chrome inspector tool",
      "CSS inspector",
    ],
    oneLiner:
      "UI Inspector tools read CSS; Design Mode reads, edits, and ships the diff.",
    positioning:
      "Inspector tools tell you what's on the page. Design Mode lets you change it, log the change, and hand the diff to engineering or an AI agent.",
    whenToPickDesignMode: [
      "You want to make changes, not just read them.",
      "You want to ship the changes somewhere.",
      "You want an AI agent to write the production code.",
    ],
    whenToPickCompetitor: [
      "All you need is a read-only inspector and the browser already has DevTools.",
    ],
    table: baseFeatures({
      editing: "Read-only inspection",
      mcp: "No",
      history: "None",
      os: "Often free",
      price: "Often free",
      export: "Copy CSS to clipboard",
      fit: "Inspecting layouts",
    }),
    honesty:
      "If you literally just need to peek at CSS, Chrome DevTools is free and built-in. If you want to make changes that go somewhere, Design Mode is the next step up.",
    related: [
      "design-mode-vs-chrome-devtools",
      "design-mode-vs-csspeeper",
      "design-mode-vs-hover-inspector",
    ],
  },
  {
    slug: "design-mode-vs-cursor-design-mode",
    competitor: "Cursor's built-in design mode",
    title: "Design Mode vs Cursor's design mode",
    metaTitle:
      "Design Mode vs Cursor's design mode — browser surface vs editor surface",
    metaDescription:
      "Comparison: Cursor's design mode lives in the editor; Design Mode lives on the live web page. Edit the real rendered UI with real layout context, then ship the diff back to Cursor.",
    keywords: [
      "Design Mode vs Cursor design mode",
      "Cursor design mode",
      "Cursor visual editing",
      "in-browser vs in-editor design",
    ],
    oneLiner:
      "Cursor's mode lives inside the editor. Design Mode lives on the live web page — edit the real rendered UI, then ship the diff back to Cursor.",
    positioning:
      "The fork is: do you want to edit the design inside your code editor (Cursor's mode), or on the actual rendered page in your browser (Design Mode)? The answer depends on which surface gives you more context.",
    whenToPickDesignMode: [
      "You want to edit on the rendered page, not in a code-adjacent surface.",
      "You want real device pixels, real fonts, real hover/focus/animation states.",
      "You're testing across multiple pages or staging deploys.",
    ],
    whenToPickCompetitor: [
      "You stay inside Cursor all day and don't want a second tool.",
      "Your edits are local-only and never touch a deployed surface.",
    ],
    table: baseFeatures({
      editing: "In-editor design surface",
      mcp: "Native to Cursor",
      history: "Editor history",
      os: "Proprietary",
      price: "Cursor subscription",
      export: "Code changes in editor",
      fit: "Cursor power users",
    }),
    honesty:
      "Cursor's mode is great for in-editor work. Design Mode is great when you want the canvas to be the actual rendered page. Many people use both.",
    related: [
      "design-mode-vs-stagewise",
      "design-mode-vs-chrome-devtools",
      "design-mode-vs-figma-dev-mode",
    ],
  },
  {
    slug: "design-mode-vs-csspeeper",
    competitor: "CSSPeeper",
    title: "Design Mode vs CSSPeeper",
    metaTitle: "Design Mode vs CSSPeeper — design surface vs CSS inspector",
    metaDescription:
      "Comparison: CSSPeeper is a popular CSS reader; Design Mode is a full visual editor that reads, edits, and ships the diff over MCP.",
    keywords: [
      "Design Mode vs CSSPeeper",
      "CSSPeeper alternative",
      "CSS inspector",
      "Chrome CSS extension",
    ],
    oneLiner:
      "CSSPeeper reads. Design Mode reads, edits, and ships.",
    positioning:
      "CSSPeeper is a beautiful read-only inspector. Design Mode covers the read use case and adds editing, persistence, exports, and MCP.",
    whenToPickDesignMode: [
      "You want to change values, not just read them.",
      "You want to ship structured edits to engineering or an AI agent.",
    ],
    whenToPickCompetitor: [
      "You purely want to learn how a page is built.",
    ],
    table: baseFeatures({
      editing: "Read-only",
      mcp: "No",
      history: "None",
      os: "Proprietary",
      price: "Free",
      export: "Copy CSS",
      fit: "Learning, inspecting",
    }),
    honesty:
      "Different tools for different tasks. CSSPeeper is a wonderful learning aid; Design Mode is a working surface.",
    related: [
      "design-mode-vs-ui-inspector",
      "design-mode-vs-hover-inspector",
      "design-mode-vs-chrome-devtools",
    ],
  },
  {
    slug: "design-mode-vs-hover-inspector",
    competitor: "Hover Inspector",
    title: "Design Mode vs Hover Inspector",
    metaTitle:
      "Design Mode vs Hover Inspector — full design surface vs hover-only inspection",
    metaDescription:
      "Comparison: Hover Inspector tools surface element info on hover. Design Mode adds full visual editing, persistent history, exports, and AI agent handoff.",
    keywords: [
      "Design Mode vs Hover Inspector",
      "Hover Inspector alternative",
      "live element inspector",
      "CSS hover tool",
    ],
    oneLiner:
      "Hover-only inspectors are a feature; Design Mode is a tool.",
    positioning:
      "Hover-on-element info is one capability inside Design Mode (the inspector overlay). The broader product adds editing, exports, and MCP.",
    whenToPickDesignMode: [
      "You need to make changes, not just see info.",
    ],
    whenToPickCompetitor: [
      "You only need a hover tooltip and nothing else.",
    ],
    table: baseFeatures({
      editing: "Hover info only",
      mcp: "No",
      history: "None",
      os: "Proprietary",
      price: "Free",
      export: "None",
      fit: "Casual inspection",
    }),
    honesty:
      "If hover info is all you need, the small footprint of those extensions wins. Otherwise, Design Mode includes that capability among many.",
    related: [
      "design-mode-vs-csspeeper",
      "design-mode-vs-ui-inspector",
      "design-mode-vs-chrome-devtools",
    ],
  },
  {
    slug: "design-mode-vs-builder-io-visual-copilot",
    competitor: "Builder.io Visual Copilot",
    title: "Design Mode vs Builder.io Visual Copilot",
    metaTitle:
      "Design Mode vs Builder.io Visual Copilot — direction of design-to-code",
    metaDescription:
      "Comparison: Builder.io Visual Copilot converts Figma designs into code. Design Mode goes the other direction — tweak the live page, hand the agent precise CSS deltas.",
    keywords: [
      "Design Mode vs Builder.io",
      "Builder.io Visual Copilot alternative",
      "Figma to code",
      "design to code tool",
    ],
    oneLiner:
      "Builder.io goes Figma → code. Design Mode goes live page → code.",
    positioning:
      "Different problems. Builder.io is great for greenfield Figma-driven workflows. Design Mode is great for iterating on an already-deployed product.",
    whenToPickDesignMode: [
      "Your codebase and design system already exist.",
      "You iterate on the rendered page, not in Figma.",
      "You want an AI agent to write the change inside your existing code, not generate a new component.",
    ],
    whenToPickCompetitor: [
      "You're starting from a Figma file and want generated code.",
      "Your design source of truth lives in Figma.",
    ],
    table: baseFeatures({
      editing: "Figma → code generation",
      mcp: "Figma plugin",
      history: "Per-Figma file",
      os: "Proprietary",
      price: "Paid tiers",
      export: "Generated component code",
      fit: "Greenfield Figma workflows",
    }),
    honesty:
      "Different tools for different ends of the design-to-code spectrum. Many teams use both.",
    related: [
      "design-mode-vs-locofy",
      "design-mode-vs-figma-dev-mode",
      "design-mode-vs-stagewise",
    ],
  },
  {
    slug: "design-mode-vs-locofy",
    competitor: "Locofy",
    title: "Design Mode vs Locofy",
    metaTitle: "Design Mode vs Locofy — Figma-to-code vs live-page-to-code",
    metaDescription:
      "Comparison: Locofy converts Figma to code. Design Mode lets you edit the live page and hand the structured diff to your AI coding agent.",
    keywords: [
      "Design Mode vs Locofy",
      "Locofy alternative",
      "Figma to React",
      "design to code tool",
    ],
    oneLiner:
      "Locofy generates code from Figma. Design Mode emits diffs from the live page.",
    positioning:
      "Same comparison shape as Builder.io: Figma-first generation vs live-page-first iteration. Different starting points, different fits.",
    whenToPickDesignMode: [
      "You iterate on an existing deployed product.",
      "You want diffs your AI agent applies into existing code.",
    ],
    whenToPickCompetitor: [
      "You design in Figma and need first-pass code output.",
    ],
    table: baseFeatures({
      editing: "Figma → code generation",
      mcp: "Figma plugin",
      history: "Per-Figma file",
      os: "Proprietary",
      price: "Paid tiers",
      export: "Generated component code",
      fit: "Figma-first teams",
    }),
    honesty:
      "Both can coexist — Locofy for the first-pass component, Design Mode for the production-tuning loop.",
    related: [
      "design-mode-vs-builder-io-visual-copilot",
      "design-mode-vs-figma-dev-mode",
      "design-mode-vs-stagewise",
    ],
  },
  {
    slug: "design-mode-vs-chrome-devtools",
    competitor: "Chrome DevTools",
    title: "Design Mode vs Chrome DevTools",
    metaTitle:
      "Design Mode vs Chrome DevTools — design surface vs developer inspector",
    metaDescription:
      "Comparison: Chrome DevTools is a developer inspector. Design Mode is a design surface with persistent change history, real visual controls, and one-click ship-to-AI-agent over MCP.",
    keywords: [
      "Design Mode vs Chrome DevTools",
      "DevTools alternative",
      "Chrome design tool",
      "live CSS editing alternative",
    ],
    oneLiner:
      "DevTools is a debugger. Design Mode is a design surface that emits structured diffs and ships them to AI agents.",
    positioning:
      "Chrome DevTools is the universal default — free, built-in, every web developer knows it. Design Mode is what you reach for when DevTools' lack of persistence, lack of visual controls, and lack of agent handoff start to bite.",
    whenToPickDesignMode: [
      "You want edits that persist across reloads and sessions.",
      "You want real visual controls (sliders, colour pickers, motion, effects) instead of typed CSS strings.",
      "You want to ship the diff to an AI agent or to engineering as a structured spec.",
      "You're a designer or QA without a strong CSS background.",
    ],
    whenToPickCompetitor: [
      "You're debugging behaviour, not visuals.",
      "You need DevTools' Network / Performance / Application panels.",
    ],
    table: baseFeatures({
      editing: "Type CSS rules manually; not persistent",
      mcp: "No",
      history: "Lost on reload",
      os: "Open source (Chromium)",
      price: "Free, built-in",
      export: "Copy CSS rules",
      fit: "Developers debugging behaviour",
    }),
    honesty:
      "DevTools is irreplaceable. Design Mode lives on top of it — same browser, complementary surface. Most users keep both pinned.",
    related: [
      "design-mode-vs-cursor-design-mode",
      "design-mode-vs-figma-dev-mode",
      "design-mode-vs-visbug",
    ],
  },
  {
    slug: "design-mode-vs-figma-dev-mode",
    competitor: "Figma Dev Mode",
    title: "Design Mode vs Figma Dev Mode",
    metaTitle:
      "Design Mode vs Figma Dev Mode — file-based handoff vs live-page editing",
    metaDescription:
      "Comparison: Figma Dev Mode reads a static design file. Design Mode edits the live deployed page. Pair them: design in Figma, refine on the rendered page in Design Mode.",
    keywords: [
      "Design Mode vs Figma Dev Mode",
      "Figma Dev Mode alternative",
      "design handoff tool",
      "Figma to code workflow",
    ],
    oneLiner:
      "Figma Dev Mode reads a static design file; Design Mode edits the live deployed page.",
    positioning:
      "These tools sit on opposite ends of the design-to-code pipeline. Figma Dev Mode is where designers hand off a spec; Design Mode is where the deployed page gets refined back into the source.",
    whenToPickDesignMode: [
      "You're working on the deployed product, not the Figma file.",
      "You want edits that translate directly into PRs.",
      "You want an AI agent to write the production code from your edits.",
    ],
    whenToPickCompetitor: [
      "You're reading the design spec for a new feature.",
      "Your team's source of truth is the Figma file.",
    ],
    table: baseFeatures({
      editing: "Read-only handoff of design file",
      mcp: "No",
      history: "Figma version history",
      os: "Proprietary",
      price: "Figma seat (Dev Mode tier)",
      export: "Code snippets, measurements",
      fit: "Engineers reading a Figma spec",
    }),
    honesty:
      "Different tools, different stages. Most teams that use Figma Dev Mode will also benefit from Design Mode on the deployed side.",
    related: [
      "design-mode-vs-builder-io-visual-copilot",
      "design-mode-vs-locofy",
      "design-mode-vs-cursor-design-mode",
    ],
  },
  {
    slug: "design-mode-vs-visbug",
    competitor: "VisBug",
    title: "Design Mode vs VisBug",
    metaTitle:
      "Design Mode vs VisBug — live page editor with AI agent handoff",
    metaDescription:
      "Comparison: VisBug edits live pages with a small toolbar. Design Mode adds a full side panel, persistent Changes history, exports, and MCP handoff to AI coding agents.",
    keywords: [
      "Design Mode vs VisBug",
      "VisBug alternative",
      "live page editor",
      "Chrome design extension",
    ],
    oneLiner:
      "VisBug edits the live page but has no agent / MCP handoff and no session persistence.",
    positioning:
      "VisBug is the OG of in-browser visual editing — small toolbar, quick edits, no persistence. Design Mode is the version of that idea built for the AI-coding-agent era.",
    whenToPickDesignMode: [
      "You want edits that persist and export to a structured diff.",
      "You want to ship the diff to an AI agent.",
      "You need the full design surface (motion, effects, contrast checker, layers).",
    ],
    whenToPickCompetitor: [
      "You want a tiny zero-config toolbar and nothing more.",
    ],
    table: baseFeatures({
      editing: "Yes — toolbar-based",
      mcp: "No",
      history: "Per-session, not exportable",
      os: "Apache 2.0",
      price: "Free",
      export: "Copy CSS",
      fit: "Quick in-browser tweaks",
    }),
    honesty:
      "VisBug is fantastic and influential. Design Mode is closest in spirit to it but built for a different era and a different handoff target.",
    related: [
      "design-mode-vs-chrome-devtools",
      "design-mode-vs-stagewise",
      "design-mode-vs-cursor-design-mode",
    ],
  },
  {
    slug: "design-mode-vs-figma-make",
    competitor: "Figma Make",
    title: "Design Mode vs Figma Make",
    metaTitle:
      "Design Mode vs Figma Make — open live-page editing vs credit-metered Figma generation",
    metaDescription:
      "Figma Make generates UIs and now references local / GitHub repos — but it's locked to Figma, needs a paid seat plus metered Make credits. Design Mode is free, open-source, edits your live deployed page, and hands off to any AI agent.",
    keywords: [
      "Design Mode vs Figma Make",
      "Figma Make alternative",
      "Figma Make pricing credits",
      "Figma Make vs open source",
    ],
    oneLiner:
      "Figma Make generates UIs inside Figma on metered credits; Design Mode edits your live deployed page for free and hands the diff to any agent.",
    positioning:
      "Figma Make has grown well past basic colours and typography — it now generates whole working UIs and can even reference local or GitHub repos. The catch is where it lives: inside Figma, on a paid seat, metered by Make credits that Figma bills separately from whatever LLM you already pay for. Design Mode runs in your browser on the real deployed page, is MIT-licensed and free, and brings your own agent over MCP.",
    whenToPickDesignMode: [
      "You want to edit the actual deployed page, not regenerate it in a canvas.",
      "You don't want a second metered bill (Make credits) on top of your LLM provider.",
      "You want open source, no vendor lock-in, and a bring-your-own agent (Claude Code, Cursor, …).",
    ],
    whenToPickCompetitor: [
      "Your team already lives in Figma and wants generation native to the canvas.",
      "You're spinning up a fresh prototype from a prompt rather than refining a shipped page.",
    ],
    table: [
      ...baseFeatures({
        editing:
          "Generates UIs in Figma's canvas/files (and from local / GitHub repos) — not your live deployed page",
        mcp: "No open MCP handoff — output stays in Figma or its export",
        history: "Figma version history (inside the file)",
        os: "Proprietary — vendor-locked to Figma",
        price:
          "Paid Figma seat + metered Make credits, billed by Figma separately from your LLM provider",
        export: "Code export within Figma's ecosystem",
        fit: "Teams who live in Figma and accept credit-metered generation",
      }),
      {
        feature: "Works from your local / GitHub repo",
        designMode:
          "Edits the live rendered page; the diff plus file:line hints go to your agent to apply in the repo with the model you already pay for",
        competitor:
          "Yes — but generation is metered by Make credits and the workflow stays anchored in Figma",
      },
    ],
    honesty:
      "Figma Make is genuinely powerful inside Figma's ecosystem, and the local / GitHub-repo support is real. But it's a paid, credit-metered, Figma-locked generator. Design Mode is the opposite trade: free, open, bring-your-own-LLM, and pointed at the live page you've already shipped.",
    related: [
      "design-mode-vs-figma-dev-mode",
      "design-mode-vs-builder-io-visual-copilot",
      "design-mode-vs-locofy",
    ],
  },
];

export function getComparison(slug: string): Comparison | undefined {
  return comparisons.find((c) => c.slug === slug);
}
