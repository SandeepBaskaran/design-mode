export type UseCase = {
  slug: string;
  persona: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  intro: string;
  problem: string;
  workflow: { name: string; text: string }[];
  outcome: string;
  related: string[];
};

export const useCases: UseCase[] = [
  {
    slug: "vibe-coding-with-claude-code",
    persona: "Vibe coders & AI-coding-agent users",
    title: "Vibe coding with Claude Code",
    metaTitle: "Vibe coding with Claude Code — visual editing + AI agent loop",
    metaDescription:
      "Use Design Mode, a Chrome and Firefox extension, with Claude Code: edit a scriptable page visually, hand the structured diff over MCP, then review Claude Code's repository implementation.",
    keywords: [
      "vibe coding",
      "Claude Code visual editor",
      "Claude Code MCP",
      "AI coding agent UI",
      "design with AI agent",
    ],
    intro:
      "Design Mode is a Chrome and Firefox extension that edits the rendered page. Claude Code is a coding agent that implements changes in a repository it can access. The loop is: decide the look in the browser, ask Claude Code to implement a scoped change, then review the source diff. Design Mode is not Claude's editor, and it does not write your files.",
    problem:
      'Claude Code is strong at writing CSS once it knows exactly what you want. The bottleneck is conveying design intent. Screenshots are ambiguous. Mock files drift from the production page. "Make the hero pop more" is too vague.',
    workflow: [
      {
        name: "Open a scriptable page in your browser",
        text: "Browse to your dev server, staging URL, or a production page the extension can script. Browser-protected surfaces are out of scope. Open the Design Mode side panel.",
      },
      {
        name: "Make the change visually",
        text: "Click the element. Drag handles to resize, pick colours, adjust spacing, change typography. Every edit lands in the Changes tab as a structured diff.",
      },
      {
        name: "Send to Claude Code over MCP",
        text: "With Claude Code connected through Cloud, Local, or Self-hosted MCP, click Send to Agent to mark the session ready. Ask Claude Code to read the selectors and properties, implement only that scoped change in the repository it already has access to, and show you the diff. Use the current MCP setup guide for client-specific configuration.",
      },
      {
        name: "Review the repository change",
        text: "Inspect the source diff, then reload without Design Mode overrides. The browser preview is not evidence that production source already matches. Tweak in Design Mode and resend if needed.",
      },
    ],
    outcome:
      "Claude Code receives selectors and values instead of a screenshot guess. You still review the implementation in the repository; a closer first pass is not a timed guarantee.",
    related: [
      "visual-editing-with-cursor",
      "tailwind-component-tuning",
      "redesign-any-website",
    ],
  },
  {
    slug: "visual-editing-with-cursor",
    persona: "Cursor users",
    title: "Visual editing with Cursor",
    metaTitle: "Visual editing with Cursor — MCP-powered UI design loop",
    metaDescription:
      "Use Design Mode, a browser extension, with Cursor: edit a scriptable webpage, send the structured diff over MCP, then review Cursor's repository implementation. Distinct from Cursor's built-in design mode.",
    keywords: [
      "Cursor visual editor",
      "Cursor MCP",
      "Cursor design tool",
      "Cursor UI editing",
      "Cursor + Design Mode",
    ],
    intro:
      "Design Mode is an independent Chrome and Firefox extension, distinct from Cursor’s built-in design mode. Preview a change on a scriptable webpage, then ask Cursor to implement only that change in the repository you have authorised. Review the diff before committing.",
    problem:
      "A screenshot can show the visual issue without identifying its selector, exact values or intended state. Pair it with recorded changes and a scoped implementation request.",
    workflow: [
      {
        name: "Point Cursor at Design Mode",
        text: "Use the current MCP setup guide to choose a Cursor project or global configuration. Match the connection mode, protect the bearer token when required, and verify a read-only session call before asking for source edits.",
      },
      {
        name: "Edit the page in the browser",
        text: "Open the Design Mode side panel on a scriptable page such as your dev server. Make the visual change with sliders and pickers. Browser-protected pages are out of scope.",
      },
      {
        name: "Ask Cursor to implement, then review",
        text: "From a Cursor chat, ask the agent to apply only the latest Design Mode changes in the current repository. It can call get_changes over MCP and write CSS where it has access. Review the source diff before you commit.",
      },
    ],
    outcome:
      "Design Mode specifies the visual change on the rendered page; Cursor implements it only where it has repository access. You review and commit. The two surfaces can coexist: editor-native for in-Cursor work, the extension for the live page.",
    related: [
      "vibe-coding-with-claude-code",
      "tailwind-component-tuning",
      "redesign-any-website",
    ],
  },
  {
    slug: "redesign-any-website",
    persona: "Designers",
    title: "Preview a redesign on a webpage",
    metaTitle:
      "Preview a redesign on a webpage — browser-as-design-surface with Design Mode",
    metaDescription:
      "Open a scriptable URL in your browser, select an accessible element, and preview changes visually — no source code, no Figma mock. Every change is a structured preview you can hand to your team or AI agent.",
    keywords: [
      "redesign a website",
      "in-browser website editor",
      "live website design tool",
      "edit any website CSS",
      "browser extension for designers",
    ],
    intro:
      "Most design tools want you to start in a file. Design Mode lets you start on a rendered page the extension can script — your site, a staging URL, or another scriptable page — and redesign it visually in your browser. It does not bypass browser protections, and the preview is not a source change.",
    problem:
      "Recreating a real page in Figma so you can iterate on it is enormous setup cost. By the time the mock is ready, the live page has changed. Iteration in a mock that doesn't match production means decisions that don't translate.",
    workflow: [
      {
        name: "Open the page",
        text: "Browse to a localhost, staging, or production URL the extension can script. Open the Design Mode side panel.",
      },
      {
        name: "Select an element and preview a change",
        text: "Typography, colour, layout, spacing, motion, effects, copy, DOM. Every input is a real control — not a CSS textarea.",
      },
      {
        name: "Compare before / after",
        text: "Use the screenshot button to capture before, make your edits, capture after.",
      },
      {
        name: "Export the spec",
        text: "Hand a structured diff to engineering, or to a coding agent that has separate repository access. Someone still reviews the source change.",
      },
    ],
    outcome:
      "You designed on the rendered page. Shipping still requires a source change; the browser preview is not production.",
    related: [
      "design-review-in-production",
      "tailwind-component-tuning",
      "landing-page-iteration-for-indie-hackers",
    ],
  },
  {
    slug: "design-review-in-production",
    persona: "Designers & design ops",
    title: "Design review in production",
    metaTitle:
      "Design review in production — annotate the live deploy, ship a structured diff",
    metaDescription:
      "Review a deployed app against your design reference, annotate issues and record candidate fixes for engineering. Pair the specification with screenshots and acceptance checks.",
    keywords: [
      "design review tool",
      "design QA",
      "live design review",
      "production design audit",
      "design handoff",
    ],
    intro:
      "Review a deployed page against your agreed design reference, annotate deviations, and record candidate fixes for engineering. The local preview does not alter production.",
    problem:
      'Verbal feedback is lossy. "This needs more breathing room" can mean any of five different changes depending on who reads it. Engineers waste cycles asking which spacing token.',
    workflow: [
      {
        name: "Walk the deployed app",
        text: "Open the Design Mode side panel on each page in scope. Comment pins on issues; edits for fixes you can already make.",
      },
      {
        name: "Capture before / after",
        text: "Capture screenshots manually before and after the preview. Pair them with the recorded changes, page URL, viewport and review notes.",
      },
      {
        name: "Export the spec",
        text: "Use Copy as prompt to copy a Markdown specification. Paste it into your tracker and attach screenshots separately.",
      },
    ],
    outcome:
      "Engineering receives the proposed changes and review context. Confirm scope, resolve open questions and verify the implemented source.",
    related: [
      "ui-testing-export-to-developers",
      "bug-report-with-visual-diff",
      "design-system-audit",
    ],
  },
  {
    slug: "tailwind-component-tuning",
    persona: "Frontend developers",
    title: "Tailwind component tuning",
    metaTitle:
      "Tailwind component tuning — edit shadcn / Tailwind UI visually with AI agent handoff",
    metaDescription:
      "Tune Tailwind / shadcn components visually in the browser, then have Claude Code or Cursor write the utility classes. Review how the agent maps the values to your project’s utilities and tokens.",
    keywords: [
      "Tailwind visual editor",
      "shadcn visual editor",
      "tune Tailwind components",
      "edit Tailwind in browser",
      "Tailwind + AI agent",
    ],
    intro:
      "Tune the rendered component, then ask your agent to map the selected values to existing Tailwind utilities or tokens. Design Mode records browser CSS changes; it is not a source-level Tailwind class editor.",
    problem:
      "Adjusting `space-y-4` to something between 16 and 20 pixels means editing classes, refreshing, and eyeballing. Multiply that across a real component and the loop kills momentum.",
    workflow: [
      {
        name: "Open the component in the browser",
        text: "Open your storybook or your live page. Open the side panel.",
      },
      {
        name: "Tune visually",
        text: "Drag handles, change colours, adjust spacing in pixel increments.",
      },
      {
        name: "Hand the diff to your agent",
        text: "Ask the agent to inspect the existing utilities and tokens first. Reuse an exact matching value; flag an unmatched value rather than silently choosing the nearest utility. Specify whether shared instances and breakpoints should change.",
      },
    ],
    outcome:
      "Review the utility-class diff and check the component at desktop and mobile widths without preview overrides. Token reuse and shared-component scope are acceptance checks, not automatic guarantees.",
    related: [
      "vibe-coding-with-claude-code",
      "visual-editing-with-cursor",
      "design-system-audit",
    ],
  },
  {
    slug: "figma-to-code-without-figma",
    persona: "Solo makers & small teams",
    title: "Refine an existing page without a duplicate mock-up",
    metaTitle: "Refine an existing page without a duplicate mock-up",
    metaDescription:
      "Skip the Figma round-trip. Edit the real page visually, hand the structured diff to your AI agent, and let it write the code. This workflow refines existing pages; it does not import or convert Figma files.",
    keywords: [
      "Figma alternative",
      "design without Figma",
      "Figma to code",
      "design-to-code",
      "live design tool",
    ],
    intro:
      "Figma is a great file format. It's not always the right tool for a one-person team iterating on a real, deployed product. Design Mode lets you skip the mock layer entirely.",
    problem:
      "Maintaining a Figma file that matches production is its own job. Small teams can't afford the round-trip; indie hackers don't have time for the discipline.",
    workflow: [
      {
        name: "Edit the live page",
        text: "Open Design Mode on your dev server or staging URL. Make the change visually.",
      },
      {
        name: "Ship to your AI agent",
        text: "Send to Agent marks the session ready for a connected client such as Claude Code or Cursor. The client can retrieve the changes and implement them only when it has separate repository access.",
      },
      {
        name: "Optional: use Figma for greenfield",
        text: "Keep Figma for blank-canvas exploration. Use Design Mode for everything that already exists.",
      },
    ],
    outcome:
      "A browser-based specification for an existing page, ready for implementation and review. This is not Figma-file conversion.",
    related: [
      "vibe-coding-with-claude-code",
      "landing-page-iteration-for-indie-hackers",
      "redesign-any-website",
    ],
  },
  {
    slug: "ui-testing-export-to-developers",
    persona: "QA / UI testers",
    title: "UI testing — export visual bugs to developers with full context",
    metaTitle:
      "UI testing — export visual bug reports to developers with full context",
    metaDescription:
      "QA testers and designers annotate broken layout, contrast, and copy on a staging URL with Design Mode, then export a structured diff (selector → property → value) so developers see exactly what to change.",
    keywords: [
      "UI testing",
      "visual bug report",
      "QA design tool",
      "design handoff with full context",
      "staging URL annotation",
      "structured bug report",
      "visual diff for developers",
    ],
    intro:
      "For manual visual QA, record the affected element, observed state and intended change. Copy a Markdown specification and attach screenshots. This is a reporting workflow, not automated UI testing.",
    problem:
      "Most UI bug reports are screenshot + prose: \"the button is misaligned on mobile.\" Engineering opens the page, can't reproduce, asks for repro steps, gets a Loom, still can't tell which spacing value is wrong. Include browser, viewport, reproduction steps, expected and actual behaviour, and any unresolved questions.",
    workflow: [
      {
        name: "Walk the build under test",
        text: "QA opens the staging URL in their browser and pins the Design Mode side panel. As bugs surface, click the affected element.",
      },
      {
        name: "Annotate with structured edits",
        text: 'Drop a comment pin with a description ("misaligned with header"). If you know the fix, make it — change the spacing, the colour, the type size — and let Design Mode log the exact selector + property + before/after value.',
      },
      {
        name: "Capture before / after screenshots",
        text: "The screenshot tool grabs the visible tab; pair with the structured diff so reviewers can see both the artefact and the spec.",
      },
      {
        name: "Export and hand off",
        text: "Use Copy as prompt to copy Markdown into your tracker. Review selectors and before/after values, then attach screenshots and reproduction steps separately.",
      },
    ],
    outcome:
      "The ticket contains a candidate fix and reproduction context. Engineering still investigates the cause, implements the source change and verifies the result.",
    related: [
      "bug-report-with-visual-diff",
      "design-review-in-production",
      "accessibility-quick-fixes",
    ],
  },
  {
    slug: "bug-report-with-visual-diff",
    persona: "Designers & PMs",
    title: "Bug reports with a visual diff",
    metaTitle:
      "Bug reports with a visual diff — Linear, GitHub, Jira-ready output",
    metaDescription:
      "File bug reports that point at the exact pixel. Design Mode generates a structured diff with selector → property → value that pastes directly into Linear, GitHub, or Jira.",
    keywords: [
      "visual bug report",
      "bug report tool",
      "Linear bug report",
      "Jira bug report",
      "design bug ticket",
      "visual diff",
    ],
    intro:
      "PMs and designers file most of the visual bugs. Engineering has to translate ambiguous descriptions into code changes. Design Mode bridges the two — annotate the bug visually, export a developer-ready diff.",
    problem:
      '"The button is wrong" is not actionable. "The button\'s `padding-block` should change from 8px to 12px and the `background-color` from #3B82F6 to #4F46E5" is. These are illustrative values: confirm the intended change on the affected page.',
    workflow: [
      {
        name: "Open the affected page",
        text: "Browse to the page where the bug appears. Open the Design Mode side panel.",
      },
      {
        name: "Fix it visually",
        text: "Make the change you'd want shipped. Use the contrast checker, the spacing inspector, the type controls.",
      },
      {
        name: "Copy the Markdown specification",
        text: "Click Copy as prompt to copy the recorded changes as Markdown. Review the scope before pasting it into your tracker.",
      },
      {
        name: "Paste into your tracker",
        text: "Linear, GitHub, Jira, Asana — all accept the markdown. Attach the before/after screenshots from Design Mode.",
      },
    ],
    outcome:
      "The report separates the observed problem from the proposed fix, giving engineering a starting point to investigate and verify.",
    related: [
      "ui-testing-export-to-developers",
      "copy-edits-without-a-pr",
      "design-review-in-production",
    ],
  },
  {
    slug: "copy-edits-without-a-pr",
    persona: "Content & marketing teams",
    title: "Propose copy edits without opening a PR yourself",
    metaTitle: "Copy edits without a PR — marketing and content team workflow",
    metaDescription:
      "Preview proposed microcopy on a rendered page, copy the specification, and hand it to engineering. A developer or authorised agent still implements and reviews the source change.",
    keywords: [
      "copy editing tool",
      "marketing copy edits",
      "edit website copy",
      "microcopy workflow",
      "content handoff",
    ],
    intro:
      'Marketing teams ship copy changes all day. Every "can we change this headline?" turns into a Slack thread, a Figma comment, and finally a PR — for what amounts to seven words. Design Mode lets you propose the text in context; a developer or authorised agent still implements and reviews the source change.',
    problem:
      "Content people don't have repo access. Designers don't want to update mocks for microcopy. Engineering interrupts their flow to commit a four-word change.",
    workflow: [
      {
        name: "Edit live copy",
        text: "Open the side panel on the live page or staging URL. Click any text, type the new copy.",
      },
      {
        name: "Export the diff",
        text: "Use Copy as prompt to copy recorded text changes as Markdown. Review selectors, localisation needs and accessible labels before sharing.",
      },
      {
        name: "Hand off to engineering",
        text: "One ticket with the diff and a screenshot — engineering does the commit.",
      },
    ],
    outcome:
      "A contextual copy proposal for engineering. Check long-copy wrapping and accessible names after implementation; the preview does not publish the text.",
    related: [
      "bug-report-with-visual-diff",
      "client-handoff-from-agency-to-engineering",
      "design-review-in-production",
    ],
  },
  {
    slug: "accessibility-quick-fixes",
    persona: "Accessibility & design",
    title: "Accessibility quick fixes",
    metaTitle:
      "Accessibility quick fixes — WCAG contrast, type size, focus states",
    metaDescription:
      "Preview candidate visual accessibility fixes in Design Mode, copy a scoped specification, then implement and test in source. Contrast feedback is not a full accessibility audit.",
    keywords: [
      "accessibility audit tool",
      "WCAG contrast checker",
      "a11y fixes",
      "fix contrast issues",
      "accessibility design tool",
    ],
    intro:
      "Use Design Mode to preview candidate visual accessibility fixes, such as text colour and size changes, then implement and test them in source. Its contrast read-out is not a complete accessibility audit.",
    problem:
      "Visual feedback needs implementation context. Record a candidate fix and the test needed to verify it; include semantic, keyboard and screen-reader checks outside the extension.",
    workflow: [
      {
        name: "Open the page and walk it",
        text: "Use the colour picker to spot-check contrast, then verify against the actual background. Gradients, images and transparency need additional checks.",
      },
      {
        name: "Fix issues visually",
        text: "Preview text colour, size or spacing changes. Record focus and target-size requirements as comments where needed; test keyboard focus and target dimensions in the implemented page.",
      },
      {
        name: "Export the backlog",
        text: "Use Copy as prompt to copy the candidate changes as Markdown. Add the failing condition, expected behaviour and verification steps to the accessibility backlog.",
      },
    ],
    outcome:
      "A scoped set of candidate visual fixes. Test the source implementation with keyboard and assistive technology where relevant; no export establishes WCAG conformance.",
    related: [
      "ui-testing-export-to-developers",
      "bug-report-with-visual-diff",
      "design-system-audit",
    ],
  },
  {
    slug: "landing-page-iteration-for-indie-hackers",
    persona: "Indie hackers & solo founders",
    title: "Landing-page iteration for indie hackers",
    metaTitle:
      "Landing-page iteration for indie hackers — Design Mode + Claude Code",
    metaDescription:
      "Solo makers iterate on their landing page: edit the rendered page in Design Mode, hand the diff to Claude Code or Cursor, then review the source change. Choose a copied prompt or an MCP handoff.",
    keywords: [
      "landing page iteration",
      "indie hacker tools",
      "solo founder design",
      "vibe coding landing page",
      "AI agent landing page",
    ],
    intro:
      "If you're a solo founder, the landing page is your conversion funnel and your weekend project. Design Mode lets you preview a visual hypothesis before asking an agent to implement it. A preferred appearance is not evidence of better conversion.",
    problem:
      "Iterating on a landing page in a Figma file, copying decisions back into code, then deploying is a four-step loop. By the time you ship, you've lost the energy of the original idea.",
    workflow: [
      {
        name: "Open the live page",
        text: "Open your deployed landing page. Open the side panel.",
      },
      {
        name: "Iterate visually",
        text: "Try the new hero copy. Try the new CTA colour. Try the spacing variant. Every iteration is a structured change you can undo.",
      },
      {
        name: "Ship via your agent",
        text: "Use Send to Agent with a verified MCP client. The client retrieves the session, implements the source change with its own repository access, and returns a diff for review.",
      },
    ],
    outcome:
      "You can test a hypothesis on the rendered page, then implement and review it in source. The preview is not a live deploy.",
    related: [
      "redesign-any-website",
      "figma-to-code-without-figma",
      "vibe-coding-with-claude-code",
    ],
  },
  {
    slug: "client-handoff-from-agency-to-engineering",
    persona: "Agencies",
    title: "Client handoff: agency to engineering",
    metaTitle:
      "Client handoff from agency to engineering — structured design specs",
    metaDescription:
      "Record agreed visual changes on a client’s staging page, then give engineering a scoped specification with approval ownership, screenshots and open questions.",
    keywords: [
      "agency design handoff",
      "client design review",
      "design spec for engineering",
      "agency workflow",
      "agency tools",
    ],
    intro:
      "Agency design reviews often happen on the client's staging URL with three people on a call. Design Mode turns that ad-hoc conversation into a structured artefact engineering can act on.",
    problem:
      "Agencies own the design; the client's engineering team owns the build. A useful handoff identifies approved decisions, open questions and the person responsible for acceptance.",
    workflow: [
      {
        name: "Run the review on staging",
        text: "Pull up the staging URL. Open Design Mode. As decisions land, make the changes in the panel.",
      },
      {
        name: "Bundle the spec",
        text: "Export JSON for portable session data; use Copy as prompt for a Markdown specification. Attach screenshots separately, record the approval owner and review the bundle for sensitive data.",
      },
      {
        name: "Send to the client's engineers",
        text: "Engineering reads the structured spec and ships. Optional: their coding agent implements the change when it has repository access; someone still reviews the diff.",
      },
    ],
    outcome:
      "A reviewable record of agreed changes, open questions and acceptance ownership. Engineering still implements and verifies the source.",
    related: [
      "design-review-in-production",
      "bug-report-with-visual-diff",
      "copy-edits-without-a-pr",
    ],
  },
  {
    slug: "design-system-audit",
    persona: "Design-system maintainers",
    title: "Design-system audit on a deployed app",
    metaTitle:
      "Design-system audit — find token drift in a deployed app with Design Mode",
    metaDescription:
      "Compare rendered colours, spacing, type and radius with an agreed token reference. Record scoped corrections for engineering and verify shared-token effects after implementation.",
    keywords: [
      "design system audit",
      "design token drift",
      "design system maintenance",
      "design QA",
      "design ops",
    ],
    intro:
      "Design systems decay. Engineers under deadline reach for raw hex codes; designers hand off without checking tokens; a year later the deployed app uses 14 shades of grey. Use Design Mode to compare rendered values with your agreed token reference and record candidate corrections.",
    problem:
      "Reading code for drift means parsing thousands of CSS rules. Reading the design system file doesn't tell you what's actually deployed. The rendered page shows the current result, not necessarily the intended token. Compare source definitions and the agreed design-system reference too; inaccessible stylesheets can limit discovery.",
    workflow: [
      {
        name: "Walk the deployed app",
        text: "Open key pages with Design Mode. Use the colour picker to spot non-token colours.",
      },
      {
        name: "Log drift as structured changes",
        text: "Replace off-spec values with the correct token. Each replacement is logged.",
      },
      {
        name: "Export the audit",
        text: "Use Copy as prompt to copy the recorded changes as Markdown. Add the expected token, resolved value, scope and exceptions; engineering implements and reviews the fixes.",
      },
    ],
    outcome:
      "A scoped drift report to verify after implementation. Check shared-token effects on other pages before accepting the changes.",
    related: [
      "tailwind-component-tuning",
      "design-review-in-production",
      "accessibility-quick-fixes",
    ],
  },
];

export function getUseCase(slug: string): UseCase | undefined {
  return useCases.find((u) => u.slug === slug);
}
