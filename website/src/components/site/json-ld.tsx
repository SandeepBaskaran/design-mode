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
const CHROME_URL =
  "https://chromewebstore.google.com/detail/design-mode/ighgobegfcmjagombgnfhgioflinojih";
const FIREFOX_URL =
  "https://addons.mozilla.org/firefox/addon/design-mode-add-on/";
const X_URL = "https://x.com/sandeepbaskaran";
const AUTHOR_URL = "https://sandeepbaskaran.com";

const IDS = {
  website: `${SITE_URL}/#website`,
  software: `${SITE_URL}/#software`,
  person: `${SITE_URL}/#creator`,
};

export const personSchema = {
  "@context": "https://schema.org",
  "@type": "Person",
  "@id": IDS.person,
  name: "Sandeep Baskaran",
  url: AUTHOR_URL,
  jobTitle: "Senior UX Designer",
  sameAs: [X_URL, AUTHOR_URL],
  description:
    "Senior UX Designer based in Bengaluru and creator of Design Mode, a free open-source browser visual editor for AI coding agents.",
};

export const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": IDS.website,
  name: "Design Mode",
  alternateName: "DesignMode",
  about: { "@id": IDS.software },
  url: SITE_URL,
  description:
    "A browser visual editor that captures changes to a rendered webpage and hands them to AI coding agents.",
  publisher: { "@id": IDS.person },
};

export const softwareApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": IDS.software,
  name: "Design Mode",
  description:
    "A free browser extension for Chrome, Firefox and Safari on Mac. It edits a rendered webpage, records the changes, and hands them to a coding agent.",
  applicationCategory: "DesignApplication",
  applicationSubCategory: "BrowserExtension",
  softwareRequirements:
    "Desktop Chromium with Manifest V3 side panels, Firefox 121+, or Safari on Mac via the temporary Web Inspector extension from GitHub Releases",
  url: SITE_URL,
  downloadUrl: [
    CHROME_URL,
    FIREFOX_URL,
    "https://github.com/SandeepBaskaran/design-mode/releases/latest",
  ],
  installUrl: [CHROME_URL, FIREFOX_URL],
  sameAs: [REPO_URL, CHROME_URL, FIREFOX_URL],
  softwareVersion: "3.0.0",
  license: "https://opensource.org/licenses/MIT",
  isPartOf: { "@id": IDS.website },
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  author: { "@id": IDS.person },
  publisher: { "@id": IDS.person },
};

export function faqSchema(qa: Array<{ question: string; answer: string }>) {
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
  datePublished?: string;
  dateModified?: string;
  type?: "Article" | "BlogPosting" | "TechArticle";
}) {
  return {
    "@context": "https://schema.org",
    "@type": opts.type ?? "Article",
    headline: opts.title,
    description: opts.description,
    url: opts.url,
    image: `${SITE_URL}/og-design-mode-inter-v3.png`,
    ...(opts.datePublished ? { datePublished: opts.datePublished } : {}),
    ...(opts.dateModified ? { dateModified: opts.dateModified } : {}),
    author: { "@id": IDS.person },
    publisher: { "@id": IDS.person },
    isPartOf: { "@id": IDS.website },
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
  return articleSchema({ ...opts, type: "BlogPosting" });
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
    step: opts.steps.map((step, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: step.name,
      text: step.text,
      url: `${opts.url}#step-${i + 1}`,
    })),
  };
}

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

export function collectionPageSchema(opts: {
  name: string;
  description: string;
  url: string;
  items: Array<{ name: string; url: string }>;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: opts.name,
    description: opts.description,
    url: opts.url,
    isPartOf: { "@id": IDS.website },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: opts.items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        url: item.url,
      })),
    },
  };
}
