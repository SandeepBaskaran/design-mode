export type UseCase = {
  slug: string;
  persona: string;
  title: string;
  summary: string;
};

export const useCases: UseCase[] = [
  {
    slug: "vibe-coding-with-claude-code",
    persona: "People using Claude Code",
    title: "Vibe coding with Claude Code",
    summary:
      "Edit the rendered page, send the recorded changes to Claude Code over MCP, then review the source diff. Design Mode does not write your files.",
  },
  {
    slug: "visual-editing-with-cursor",
    persona: "Cursor users",
    title: "Visual editing with Cursor",
    summary:
      "Edit the live page in the browser, then ask Cursor to implement that scoped change in the repository you already opened.",
  },
  {
    slug: "redesign-any-website",
    persona: "Designers",
    title: "Redesign a scriptable page",
    summary:
      "Start on a page the extension can script and redesign it in the browser. The preview is not a change to the publisher’s source.",
  },
  {
    slug: "design-review-in-production",
    persona: "Designers and design ops",
    title: "Design review on a deployed page",
    summary:
      "Comment on a deployed page, make the fixes you already know, and export a structured diff for engineering.",
  },
  {
    slug: "tailwind-component-tuning",
    persona: "Frontend developers",
    title: "Tune a component visually",
    summary:
      "Adjust spacing, colour and type on the rendered component, then hand the recorded values to an agent that can map them back to your utilities or tokens.",
  },
  {
    slug: "figma-to-code-without-figma",
    persona: "Solo makers and small teams",
    title: "Skip the mock for pages that exist",
    summary:
      "Edit a page that is already rendered, then hand the diff to an agent. Keep a design file when you need a blank canvas.",
  },
  {
    slug: "ui-testing-export-to-developers",
    persona: "QA and UI testers",
    title: "Export a visual bug with context",
    summary:
      "Annotate a staging page and export the selector, property and before/after values for the developer.",
  },
  {
    slug: "bug-report-with-visual-diff",
    persona: "Designers and PMs",
    title: "File a bug as a visual diff",
    summary:
      "Make the intended fix on the page and paste the Markdown diff into your tracker.",
  },
  {
    slug: "copy-edits-without-a-pr",
    persona: "Content and marketing",
    title: "Hand off copy edits",
    summary:
      "Change the text on the page and export those text changes for someone with repository access to commit.",
  },
  {
    slug: "accessibility-quick-fixes",
    persona: "Accessibility and design",
    title: "Try accessibility fixes on the page",
    summary:
      "Spot-check contrast, adjust type, colour, focus and targets, then export the recorded changes. Still verify with keyboard and assistive technology.",
  },
  {
    slug: "landing-page-iteration-for-indie-hackers",
    persona: "Indie hackers and solo founders",
    title: "Iterate on a landing page",
    summary:
      "Try hero, call-to-action and spacing changes on the rendered page, send them to an agent, and review the source diff. The preview is not a deploy.",
  },
  {
    slug: "client-handoff-from-agency-to-engineering",
    persona: "Agencies",
    title: "Hand a review to engineering",
    summary:
      "Make the review decisions on the client’s staging URL and export a spec their engineers can implement.",
  },
  {
    slug: "design-system-audit",
    persona: "Design-system maintainers",
    title: "Audit a deployed app",
    summary:
      "Walk the rendered app, replace off-spec colour, spacing, type or radius, and export that audit.",
  },
];
