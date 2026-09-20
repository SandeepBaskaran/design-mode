import styles from "./demo.module.scss";
import { DemoLeftNav } from "./DemoLeftNav";
import { DemoStep } from "./DemoStep";
import { renderDemoTarget } from "./DemoTargets";
import { ExtensionDetected } from "./ExtensionDetected";
import { STEPS } from "./steps";

import { Background } from "@/components/background";

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
        alt: "Design Mode browser visual editor for AI coding agents",
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
        alt: "Design Mode browser visual editor for AI coding agents",
      },
    ],
  },
};

export default function DemoPage() {
  return (
    <>
      {/* Hero — yellow background slab */}
      <Background>
        <section className="py-12 lg:py-16">
          <div className="container max-w-5xl">
            <h1 className="text-3xl tracking-tight sm:text-4xl md:text-5xl">
              Live demo
            </h1>
            <p className="text-muted-foreground mt-4 max-w-3xl text-base md:text-2xl">
              Open the side panel on this page and try every feature with the
              demo targets below — no recordings, the canvas is the real thing.
            </p>
          </div>
        </section>
      </Background>

      {/* Middle — interactive canvas */}
      <section className="py-12 lg:py-16">
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
