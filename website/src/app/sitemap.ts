import type { MetadataRoute } from "next";

const BASE = "https://designmode.app";

const useCaseSlugs = [
  "vibe-coding-with-claude-code",
  "visual-editing-with-cursor",
  "redesign-any-website",
  "design-review-in-production",
  "tailwind-component-tuning",
  "figma-to-code-without-figma",
  "ui-testing-export-to-developers",
  "bug-report-with-visual-diff",
  "copy-edits-without-a-pr",
  "accessibility-quick-fixes",
  "landing-page-iteration-for-indie-hackers",
  "client-handoff-from-agency-to-engineering",
  "design-system-audit",
];

const compareSlugs = [
  "design-mode-vs-stagewise",
  "design-mode-vs-pls-fix",
  "design-mode-vs-drawbridge",
  "design-mode-vs-agentation",
  "design-mode-vs-dialkit",
  "design-mode-vs-ui-inspector",
  "design-mode-vs-cursor-design-mode",
  "design-mode-vs-csspeeper",
  "design-mode-vs-hover-inspector",
  "design-mode-vs-builder-io-visual-copilot",
  "design-mode-vs-locofy",
  "design-mode-vs-chrome-devtools",
  "design-mode-vs-figma-dev-mode",
  "design-mode-vs-visbug",
  "design-mode-vs-figma-make",
];

const docsSlugs = [
  "install",
  "keyboard-shortcuts",
  "mcp-setup",
  "changes-tab",
  "troubleshooting",
];

const blogSlugs = [
  "why-we-built-an-mcp-server-for-design-edits",
  "vibe-coding-visual-editing-workflow",
  "design-mode-1-5-0-changelog-deep-dive",
  "redesigning-a-tailwind-landing-page-with-claude-code",
];

const now = new Date();

export default function sitemap(): MetadataRoute.Sitemap {
  const root: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${BASE}/features`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/demo`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/mcp`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/faq`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/use-cases`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/compare`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/docs`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
  ];

  const children: MetadataRoute.Sitemap = [
    ...useCaseSlugs.map((slug) => ({
      url: `${BASE}/use-cases/${slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...compareSlugs.map((slug) => ({
      url: `${BASE}/compare/${slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...docsSlugs.map((slug) => ({
      url: `${BASE}/docs/${slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...blogSlugs.map((slug) => ({
      url: `${BASE}/blog/${slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];

  return [...root, ...children];
}
