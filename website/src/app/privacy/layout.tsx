export const metadata = {
  title: "Privacy — Design Mode runs locally by default",
  description:
    "Design Mode is a privacy-first Chrome extension. No telemetry by default, no accounts, no training on your edits. Here's exactly what data leaves your machine in each MCP mode (Cloud, Local, Self-hosted), when, and why.",
  keywords: [
    "Design Mode privacy",
    "privacy-first Chrome extension",
    "no telemetry design tool",
    "open source privacy",
    "MCP privacy",
  ],
  alternates: { canonical: "https://designmode.app/privacy" },
  openGraph: {
    title: "Privacy — Design Mode runs locally by default",
    description:
      "What data leaves your machine in each MCP mode, when, and why.",
    url: "https://designmode.app/privacy",
    images: ["/og-image.png"],
  },
};

export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
