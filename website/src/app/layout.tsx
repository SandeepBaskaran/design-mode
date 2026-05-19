import { Inter } from "next/font/google";
import localFont from "next/font/local";

import type { Metadata } from "next";

import { Footer } from "@/components/blocks/footer";
import { Navbar } from "@/components/blocks/navbar";
import { Analytics } from "@/components/site/analytics";
import { LinkTracker } from "@/components/site/link-tracker";
import { MobileNotice } from "@/components/site/mobile-notice";
import { ThemeProvider } from "@/components/theme-provider";
import "@/styles/globals.css";

const dmSans = localFont({
  src: [
    { path: "../../fonts/dm-sans/DMSans-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../fonts/dm-sans/DMSans-Italic.ttf", weight: "400", style: "italic" },
    { path: "../../fonts/dm-sans/DMSans-Medium.ttf", weight: "500", style: "normal" },
    { path: "../../fonts/dm-sans/DMSans-MediumItalic.ttf", weight: "500", style: "italic" },
    { path: "../../fonts/dm-sans/DMSans-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "../../fonts/dm-sans/DMSans-SemiBoldItalic.ttf", weight: "600", style: "italic" },
    { path: "../../fonts/dm-sans/DMSans-Bold.ttf", weight: "700", style: "normal" },
    { path: "../../fonts/dm-sans/DMSans-BoldItalic.ttf", weight: "700", style: "italic" },
  ],
  variable: "--font-dm-sans",
  display: "swap",
});

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  metadataBase: new URL("https://designmode.app"),
  title: {
    default: "Design Mode — Live design editing for developers and agents",
    template: "%s | Design Mode",
  },
  description:
    "A free, open-source Chrome extension that turns any website into a live design surface. Edit layout, type, colour, spacing and structure with visual controls, then ship the result straight to Claude Code, Cursor, or any AI coding agent over MCP.",
  keywords: [
    "Design Mode",
    "Chrome extension",
    "live CSS editing",
    "visual editor",
    "MCP",
    "Model Context Protocol",
    "Claude Code",
    "Cursor",
    "AI coding agents",
    "open source",
  ],
  authors: [{ name: "Sandeep Baskaran" }],
  creator: "Sandeep Baskaran",
  publisher: "Sandeep Baskaran",
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: "/favicon/favicon.ico", sizes: "48x48" },
      { url: "/favicon/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: [{ url: "/favicon/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: [{ url: "/favicon/favicon.ico" }],
  },
  openGraph: {
    title: "Design Mode — Live design editing for developers and agents",
    description:
      "Edit any live website with visual controls, then ship the result to Claude Code, Cursor, or any AI coding agent over MCP. Free + open source.",
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
    title: "Design Mode — Live design editing for developers and agents",
    description:
      "Edit any live website with visual controls, then ship the result to Claude Code, Cursor, or any AI coding agent over MCP.",
    images: ["/og-image.png"],
    creator: "@sandeep_baskaran",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${dmSans.variable} ${inter.variable} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <MobileNotice />
          <Navbar />
          <main>{children}</main>
          <Footer />
          <Analytics />
          <LinkTracker />
        </ThemeProvider>
      </body>
    </html>
  );
}
