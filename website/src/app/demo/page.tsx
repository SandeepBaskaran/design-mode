import styles from "./demo.module.scss";
import { DemoLeftNav } from "./DemoLeftNav";
import { DemoStep } from "./DemoStep";
import { renderDemoTarget } from "./DemoTargets";
import { ExtensionDetected } from "./ExtensionDetected";
import { STEPS } from "./steps";

import { PageHero } from "@/components/layout/page-hero";

export const metadata = {
  title: { absolute: "Try the browser visual editor | DIVE" },
  description:
    "Install DIVE, then use this guided canvas to inspect demo targets, change styles and copy the exact change specification.",
  keywords: [
    "DIVE demo",
    "try visual editor for websites",
    "live design tool demo",
    "in-browser design surface",
    "browser extension demo",
  ],
  alternates: { canonical: "https://designmode.app/demo" },
  openGraph: {
    type: "website",
    title: "Try the browser visual editor | DIVE",
    description:
      "Install DIVE, then use this guided canvas to inspect demo targets, change styles and copy the exact change specification.",
    url: "https://designmode.app/demo",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "DIVE — The visual editor for all your agent’s work",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Try the browser visual editor | DIVE",
    description:
      "Install DIVE, then use this guided canvas to inspect demo targets, change styles and copy the exact change specification.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "DIVE — The visual editor for all your agent’s work",
      },
    ],
  },
};

export default function DemoPage() {
  return (
    <>
      {/* Hero — yellow background slab */}
      <PageHero
        title="Live demo"
        description={
          <>
            <span className="md:hidden">
              Try this guided walkthrough in a desktop browser with the Design
              Mode extension installed.
            </span>
            <span className="max-md:hidden">
              Open the side panel on this page and try every feature with the
              demo targets below — no recordings, the canvas is the real thing.
            </span>
          </>
        }
      />

      <section data-ds-inline="Continue on desktop (mobile only)" className="px-4 py-12 md:hidden">
        <div className="border-border bg-card container max-w-xl rounded-2xl border p-6 text-center shadow-sm">
          <h2 className="text-xl font-semibold">Continue on desktop</h2>
          <p className="text-muted-foreground mt-3 text-base leading-7">
            This guided extension walkthrough works best in a desktop browser.
            Install DIVE, then open this page on desktop to try every
            step.
          </p>
        </div>
      </section>

      {/* Middle — interactive canvas */}
      <section data-ds-inline="Demo canvas (desktop only)" className="hidden py-12 md:block lg:py-16">
        <div className={`${styles.extensionBannerWrap} container max-w-5xl`}>
          <ExtensionDetected />
        </div>

        <div className={`${styles.demoLayout} container mt-10 max-w-5xl`}>
          <DemoLeftNav />

          <div className={styles.content} aria-label="Demo steps">
            {STEPS.map((step) => (
              <DemoStep key={step.id} step={step}>
                {renderDemoTarget(step.targetId)}
              </DemoStep>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
