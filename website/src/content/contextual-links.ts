type ContextualLink = { href: string; title: string; description: string };

const changes = {
  href: "/docs/changes-tab",
  title: "Review, copy and export recorded changes",
  description:
    "Understand JSON export, Markdown prompts and site-wide sharing scope.",
};
const changelog = {
  href: "/changelog",
  title: "Check the release history",
  description: "See what the current release says you can do.",
};
const tailwind = {
  href: "/use-cases#tailwind-component-tuning",
  title: "Tune a component visually",
  description:
    "Map preview values to existing utilities and verify the source diff.",
};
const demo = {
  href: "/demo",
  title: "Try the guided demo",
  description: "Inspect a page, record a change and review the hand-off boundary.",
};
const browsers = {
  href: "/docs/browser-support",
  title: "Check browser support and installation",
  description:
    "Chrome and Firefox store installs, plus the Safari Web Inspector zip.",
};

export const blogContextualLinks: Record<string, ContextualLink[]> = {
  "why-we-built-an-mcp-server-for-design-edits": [
    {
      href: "/mcp",
      title: "Connect through MCP",
      description: "Choose a mode and verify the connection with your client.",
    },
    {
      href: "/privacy",
      title: "Review data handling",
      description:
        "Storage, relay expiry, release-build analytics and external providers.",
    },
    changelog,
    {
      href: "/about",
      title: "About the creator",
      description: "Design Mode is an independent project by Sandeep Baskaran.",
    },
  ],
  "design-mode-1-5-0-changelog-deep-dive": [
    changelog,
    {
      href: "/use-cases#accessibility-quick-fixes",
      title: "Review candidate accessibility fixes",
      description:
        "Use contrast spot-checks alongside keyboard and assistive-technology testing.",
    },
  ],
  "design-mode-1-9-0-release": [
    changelog,
    {
      href: "/use-cases#design-system-audit",
      title: "Review design-system drift",
      description: "Compare rendered values with the project's documented tokens.",
    },
    demo,
  ],
  "design-mode-2-0-0-release": [changelog, browsers],
  "turn-visual-edits-into-precise-ai-prompts": [changes, demo, tailwind],
  "redesigning-a-tailwind-landing-page-with-claude-code": [tailwind],
};
