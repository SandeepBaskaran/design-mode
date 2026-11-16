import path from "node:path";

import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const retiredUseCases = [
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

const nextConfig: NextConfig = {
  pageExtensions: ["js", "jsx", "mdx", "ts", "tsx"],
  redirects() {
    return [
      {
        source: "/docs",
        destination: "/blog",
        permanent: true,
      },
      {
        source: "/docs/install",
        destination: "/blog/browser-support",
        permanent: true,
      },
      ...[
        "browser-support",
        "keyboard-shortcuts",
        "mcp-setup",
        "changes-tab",
        "troubleshooting",
      ].map((slug) => ({
        source: `/docs/${slug}`,
        destination: `/blog/${slug}`,
        permanent: true,
      })),
      {
        source: "/features",
        destination: "/#panel-anatomy",
        permanent: true,
      },
      {
        source: "/about",
        destination: "/#about",
        permanent: true,
      },
      {
        source: "/contact",
        destination: "/#contact",
        permanent: true,
      },
      {
        source: "/faq",
        destination: "/#faq",
        permanent: true,
      },
      {
        source: "/about-us",
        destination: "/#about",
        permanent: true,
      },
      {
        source: "/info",
        destination: "/#about",
        permanent: true,
      },
      {
        source: "/mcp-setup",
        destination: "/blog/mcp-setup",
        permanent: true,
      },
      {
        source: "/pricing",
        destination: "/",
        permanent: true,
      },
      ...retiredUseCases.map((slug) => ({
        source: `/use-cases/${slug}`,
        destination: `/use-cases#${slug}`,
        permanent: true,
      })),
    ];
  },
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
};
const withMDX = createMDX({
  options: {
    remarkPlugins: [["remark-gfm"]],
    rehypePlugins: [],
  },
});

export default withMDX(nextConfig);
