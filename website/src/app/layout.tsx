import { Caveat, Plus_Jakarta_Sans } from "next/font/google";

import type { Metadata } from "next";

import { Footer } from "@/components/blocks/footer";
import { Navbar } from "@/components/blocks/navbar";
import { Analytics } from "@/components/site/analytics";
import {
  JsonLd,
  organizationSchema,
  websiteSchema,
} from "@/components/site/json-ld";
import { LinkTracker } from "@/components/site/link-tracker";
import "@/styles/globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-caveat",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://designmode.app"),
  title: {
    default:
      "Design Mode — Visual editor for any live website, ships to Claude Code, Cursor & MCP agents",
    template: "%s | Design Mode",
  },
  description:
    "Free, open-source Chrome extension that turns any live website into a visual design surface. Edit layout, typography, colour, spacing, copy, and DOM structure, then ship the diff to Claude Code, Cursor, Claude Desktop, Windsurf, Cline, or any MCP-compatible AI coding agent. One design tool for designers, developers, QA testers, PMs, indie hackers, and vibe coders.",
  applicationName: "Design Mode",
  category: "Developer Tools",
  keywords: [
    "Design Mode",
    "Chrome extension",
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
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  alternates: {
    canonical: "https://designmode.app",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    title:
      "Design Mode — Visual editor for any live website, ships to Claude Code, Cursor & MCP agents",
    description:
      "Edit any live website with visual controls — typography, colour, layout, spacing, copy, DOM — then ship the diff to Claude Code, Cursor, Claude Desktop, Windsurf, Cline, or any MCP-compatible agent. Free + open source.",
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
    title:
      "Design Mode — Visual editor for any live website, ships to Claude Code, Cursor & MCP agents",
    description:
      "Edit any live website with visual controls, then ship the diff to Claude Code, Cursor, or any MCP-compatible AI coding agent. Free + open source.",
    creator: "@sandeepbaskaran",
    site: "@sandeepbaskaran",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className={`${jakarta.variable} ${caveat.variable} antialiased`}>
        <JsonLd data={organizationSchema} />
        <JsonLd data={websiteSchema} />
        <Navbar />
        <main className="mx-auto w-full max-w-[1200px]">{children}</main>
        <Footer />
        <Analytics />
        <LinkTracker />
      </body>
    </html>
  );
}
