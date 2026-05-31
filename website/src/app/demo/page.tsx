import styles from "./demo.module.scss";
import { DemoLeftNav } from "./DemoLeftNav";
import { DemoStep } from "./DemoStep";
import { renderDemoTarget } from "./DemoTargets";
import { ExtensionDetected } from "./ExtensionDetected";
import { STEPS } from "./steps";

import { Background } from "@/components/background";

export const metadata = {
  title: "Demo — Try Design Mode live in your browser",
  description:
    "Live, interactive walkthrough of every Design Mode feature. The page itself is the canvas — open the side panel and edit headings, colours, spacing, layout, copy, and DOM in real time.",
  keywords: [
    "Design Mode demo",
    "try visual editor for websites",
    "live design tool demo",
    "in-browser design surface",
    "Chrome extension demo",
  ],
  alternates: { canonical: "https://designmode.app/demo" },
  openGraph: {
    title: "Demo — Try Design Mode live in your browser",
    description:
      "Open the side panel on this page and try every feature with the demo targets — no recordings.",
    url: "https://designmode.app/demo",
    images: ["/og-image.png"],
  },
};

export default function DemoPage() {
  return (
    <>
      {/* Hero — yellow background slab */}
      <Background>
        <section className="pt-28 pb-12 lg:pt-44 lg:pb-16">
          <div className="container max-w-5xl">
            <h1 className="text-3xl tracking-tight sm:text-4xl md:text-5xl">
              Live demo
            </h1>
            <p className="text-muted-foreground mt-4 max-w-3xl text-lg md:text-xl">
              Open the side panel on this page and try every feature with
              the demo targets below — no recordings, the canvas is the
              real thing.
            </p>
          </div>
        </section>
      </Background>

      {/* Middle — interactive canvas */}
      <section className="py-12 lg:py-16">
        <div
          className={`${styles.extensionBannerWrap} container max-w-5xl`}
        >
          <ExtensionDetected />
        </div>

        <div
          className={`${styles.demoLayout} container mt-10 max-w-5xl`}
        >
          <DemoLeftNav />

          <main className={styles.content}>
            {STEPS.map((step) => (
              <DemoStep key={step.id} step={step}>
                {renderDemoTarget(step.targetId)}
              </DemoStep>
            ))}
          </main>
        </div>
      </section>
    </>
  );
}
