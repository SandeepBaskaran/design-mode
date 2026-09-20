import { Google_Sans_Flex } from "next/font/google";

import type { Metadata } from "next";

import { Footer } from "@/components/blocks/footer";
import { Navbar } from "@/components/blocks/navbar";
import { Analytics } from "@/components/site/analytics";
import { BackToTop } from "@/components/site/back-to-top";
import { FirefoxBanner } from "@/components/site/firefox-banner";
import { JsonLd, personSchema, websiteSchema } from "@/components/site/json-ld";
import { LinkTracker } from "@/components/site/link-tracker";
import "@/styles/globals.css";

const googleSansFlex = Google_Sans_Flex({
  subsets: ["latin"],
  variable: "--font-google-sans-flex",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  metadataBase: new URL("https://designmode.app"),
  title: {
    default: "Design Mode — Browser visual editor for AI coding agents",
    template: "%s | Design Mode",
  },
  description:
    "Edit a live webpage visually in Chrome or Firefox, capture the exact changes, and send them to Claude Code, Cursor or another MCP-compatible coding agent.",
  applicationName: "Design Mode",
  category: "Developer Tools",
  keywords: [
    "Design Mode",
    "Chrome extension",
    "Firefox add-on",
    "Firefox extension",
    "browser extension",
    "visual editor",
    "live CSS editing",
    "edit any website live",
    "in-browser design tool",
    "design-to-code",
    "AI design-to-code workflow",
    "vibe coding",
    "vibe coder tools",
    "MCP",
    "Model Context Protocol",
    "MCP server for design",
    "MCP for design edits",
    "Claude Code visual editor",
    "Cursor visual editor",
    "Claude Desktop MCP",
    "Windsurf MCP",
    "Cline MCP",
    "AI coding agent UI editing",
    "design handoff to developers",
    "UI testing export to developers",
    "visual bug report tool",
    "open source design tool",
    "free Chrome extension for designers",
    "free Firefox add-on for designers",
    "vs Stagewise",
    "vs Chrome DevTools",
    "vs Figma Dev Mode",
    "Tailwind visual editor",
    "shadcn visual editor",
    "accessibility quick fix",
    "design system audit",
    "browser design surface",
    "side panel design editor",
  ],
  authors: [{ name: "Sandeep Baskaran", url: "https://sandeepbaskaran.com" }],
  creator: "Sandeep Baskaran",
  publisher: "Sandeep Baskaran",

  openGraph: {
    type: "website",
    locale: "en_US",
    title: "Design Mode — Browser visual editor for AI coding agents",
    description:
      "Edit a live webpage visually, capture the exact changes, and send them to Claude Code, Cursor or another MCP-compatible coding agent.",
    siteName: "Design Mode",
    url: "https://designmode.app",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Design Mode — Live design editing for developers and agents",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    creator: "@sandeepbaskaran",
    site: "@sandeepbaskaran",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Design Mode browser visual editor for AI coding agents",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={googleSansFlex.variable}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body className="antialiased">
        <JsonLd data={personSchema} />
        <JsonLd data={websiteSchema} />
        <a
          href="#main-content"
          className="bg-background text-foreground focus:ring-ring sr-only fixed top-4 left-4 z-[100] rounded-md px-4 py-2 font-medium focus:not-sr-only focus:ring-2 focus:outline-none"
        >
          Skip to content
        </a>
        <Navbar />
        <FirefoxBanner />
        <main id="main-content" className="mx-auto w-full max-w-[1200px]">
          {children}
        </main>
        <Footer />
        <BackToTop />
        <Analytics />
        <LinkTracker />
      </body>
    </html>
  );
}
