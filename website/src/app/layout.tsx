import type { Metadata } from "next";
import "./globals.scss";
import { MobileNotice } from "./MobileNotice";
import { Analytics } from "./Analytics";

export const metadata: Metadata = {
  metadataBase: new URL("https://design-mode.dev"),
  title: "Design Mode",
  description: "The live design editing tool for developers and agents.",
  openGraph: {
    title: "Design Mode",
    description: "The live design editing tool for developers and agents.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Design Mode side panel",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Design Mode",
    description: "The live design editing tool for developers and agents.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&family=Cascadia+Code:ital@1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <MobileNotice />
        <main className="main-content">{children}</main>
        <Analytics />
      </body>
    </html>
  );
}
