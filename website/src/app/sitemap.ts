import type { MetadataRoute } from "next";

import { posts } from "@/content/blog";
import { comparisons, isComparisonIndexable } from "@/content/comparisons";

const BASE = "https://designmode.app";

const staticRoutes = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/demo", changeFrequency: "monthly", priority: 0.9 },
  { path: "/mcp", changeFrequency: "monthly", priority: 0.9 },
  { path: "/privacy", changeFrequency: "monthly", priority: 0.5 },
  { path: "/use-cases", changeFrequency: "monthly", priority: 0.9 },
  { path: "/compare", changeFrequency: "monthly", priority: 0.9 },
  { path: "/changelog", changeFrequency: "weekly", priority: 0.7 },
  { path: "/blog", changeFrequency: "weekly", priority: 0.7 },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: `${BASE}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const blogEntries: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${BASE}/blog/${post.slug}`,
    lastModified: post.datePublished,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const comparisonEntries: MetadataRoute.Sitemap = comparisons
    .filter(isComparisonIndexable)
    .map((comparison) => ({
      url: `${BASE}/compare/${comparison.slug}`,
      changeFrequency: "monthly",
      priority: 0.6,
    }));

  return [
    ...staticEntries,
    ...blogEntries,
    ...comparisonEntries,
  ];
}
