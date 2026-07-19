type JsonLdData = Record<string, unknown> | Array<Record<string, unknown>>;

export function JsonLd({ data }: { data: JsonLdData }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

const SITE_URL = "https://designmode.app";
const REPO_URL = "https://github.com/SandeepBaskaran/design-mode";
const X_URL = "https://x.com/sandeepbaskaran";
const AUTHOR_URL = "https://sandeepbaskaran.com";

export const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Design Mode",
  url: SITE_URL,
  logo: `${SITE_URL}/og-image.png`,
  founder: {
    "@type": "Person",
    name: "Sandeep Baskaran",
    url: AUTHOR_URL,
  },
  sameAs: [REPO_URL, X_URL, AUTHOR_URL],
};

export const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Design Mode",
  url: SITE_URL,
  description:
    "Free, open-source Chrome extension that turns any live website into a visual design surface and ships edits to AI coding agents over MCP.",
  publisher: {
    "@type": "Organization",
    name: "Design Mode",
    url: SITE_URL,
  },
  potentialAction: {
    "@type": "SearchAction",
    target: `${SITE_URL}/faq?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

export const softwareApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Design Mode",
  description:
    "Chrome extension that turns any live website into a visual design surface. Edit layout, typography, colour, spacing, copy, and DOM, then ship the diff to Claude Code, Cursor, Claude Desktop, Windsurf, Cline, or any MCP-compatible AI coding agent.",
  applicationCategory: "DesignApplication",
  applicationSubCategory: "BrowserExtension",
  operatingSystem: "Chrome, Edge, Brave, Arc",
  url: SITE_URL,
  downloadUrl: SITE_URL,
  softwareVersion: "1.9.0",
  license: "https://opensource.org/licenses/MIT",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  author: {
    "@type": "Person",
    name: "Sandeep Baskaran",
    url: AUTHOR_URL,
  },
  publisher: {
    "@type": "Organization",
    name: "Design Mode",
    url: SITE_URL,
  },
  featureList: [
    "Visual editing of any live website",
    "Layout, typography, colour, spacing, motion, effects",
    "Design-system token discovery and scope-aware token editing",
    "Trigger-first motion (Hover, Press, Focus, Appear, Loop, Scroll)",
    "DOM tree editor (Layers)",
    "Persistent change history (Changes tab)",
    "Markdown export of every edit",
    "Send to AI agent over MCP via a guided handoff modal",
    "Three MCP modes: Cloud, Local, Self-hosted",
    "Compatible with Claude Code, Cursor, Claude Desktop, Windsurf, Cline",
    "Open source (MIT)",
    "No telemetry by default",
  ],
};

export function faqSchema(
  qa: Array<{ question: string; answer: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: qa.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function articleSchema(opts: {
  title: string;
  description: string;
  url: string;
  datePublished: string;
  dateModified?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: opts.title,
    description: opts.description,
    url: opts.url,
    image: `${SITE_URL}/og-image.png`,
    datePublished: opts.datePublished,
    dateModified: opts.dateModified ?? opts.datePublished,
    author: {
      "@type": "Person",
      name: "Sandeep Baskaran",
      url: AUTHOR_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "Design Mode",
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/og-image.png` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": opts.url },
  };
}

export function blogPostingSchema(opts: {
  title: string;
  description: string;
  url: string;
  datePublished: string;
  dateModified?: string;
}) {
  return { ...articleSchema(opts), "@type": "BlogPosting" };
}

export function howToSchema(opts: {
  name: string;
  description: string;
  url: string;
  steps: Array<{ name: string; text: string }>;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: opts.name,
    description: opts.description,
    image: `${SITE_URL}/og-image.png`,
    step: opts.steps.map((step, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: step.name,
      text: step.text,
      url: `${opts.url}#step-${i + 1}`,
    })),
  };
}

export const personSchema = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "Sandeep Baskaran",
  url: AUTHOR_URL,
  jobTitle: "Design Engineer",
  worksFor: { "@type": "Organization", name: "IBM" },
  sameAs: [X_URL, REPO_URL, AUTHOR_URL],
  description:
    "Design engineer based in Bengaluru. Creator of Design Mode — an open-source Chrome extension for visual editing with AI coding agents.",
};

export function breadcrumbSchema(items: Array<{ name: string; url: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
