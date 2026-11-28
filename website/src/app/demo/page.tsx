import styles from "./demo.module.scss";
import { DemoLeftNav } from "./DemoLeftNav";
import { DemoStep } from "./DemoStep";
import { renderDemoTarget } from "./DemoTargets";
import { ExtensionDetected } from "./ExtensionDetected";
import { STEPS } from "./steps";

import { Background } from "@/components/background";
import { SectionHeader, sectionPadding } from "@/components/site/section-header";

export const metadata = {
  title: { absolute: "Try the browser visual editor | Design Mode" },
  description:
    "Install Design Mode, then use this guided canvas to inspect demo targets, change styles and copy the exact change specification.",
  keywords: [
    "Design Mode demo",
    "try visual editor for websites",
    "live design tool demo",
    "in-browser design surface",
    "browser extension demo",
  ],
  alternates: { canonical: "https://designmode.app/demo" },
  openGraph: {
    type: "website",
    title: "Try the browser visual editor | Design Mode",
    description:
      "Install Design Mode, then use this guided canvas to inspect demo targets, change styles and copy the exact change specification.",
    url: "https://designmode.app/demo",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Design Mode — The visual editor for all your agent’s work",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Try the browser visual editor | Design Mode",
    description:
      "Install Design Mode, then use this guided canvas to inspect demo targets, change styles and copy the exact change specification.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Design Mode — The visual editor for all your agent’s work",
      },
    ],
  },
};

export default function DemoPage() {
  return (
    <>
      {/* Hero — yellow background slab */}
      <Background>
        <section className={sectionPadding}>
          <div className="container max-w-5xl">
            <SectionHeader
              as="h1"
              eyebrow="Demo"
              title="Live demo"
              description="Install the extension, open the side panel on this page, and edit the targets below. On a phone, continue on a desktop browser."
            />
          </div>
        </section>
      </Background>

      <section className={`${sectionPadding} md:hidden`}>
        <div className="border-border bg-card container max-w-xl rounded-2xl border p-6 text-center shadow-sm">
          <h2 className="text-xl font-semibold">Continue on desktop</h2>
          <p className="text-muted-foreground mt-3 text-base leading-7">
            This guided extension walkthrough works best in a desktop browser.
            Install Design Mode, then open this page on desktop to try every
            step.
          </p>
        </div>
      </section>

      {/* Middle — interactive canvas */}
      <section className={`hidden md:block ${sectionPadding}`}>
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
