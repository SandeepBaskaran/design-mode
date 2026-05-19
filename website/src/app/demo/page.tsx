import styles from "./demo.module.scss";
import { DemoLeftNav } from "./DemoLeftNav";
import { DemoStep } from "./DemoStep";
import { renderDemoTarget } from "./DemoTargets";
import { ExtensionDetected } from "./ExtensionDetected";
import { STEPS } from "./steps";

import { Background } from "@/components/background";

export const metadata = {
  title: "Demo",
  description:
    "Live, interactive walkthrough of every Design Mode feature. The page itself is the canvas — open the side panel and edit it.",
};

export default function DemoPage() {
  const topLevel = STEPS.filter((s) => !s.parentId);
  const childIndexMap = new Map<string, number>();
  STEPS.forEach((s) => {
    if (!s.parentId) return;
    const siblings = STEPS.filter((x) => x.parentId === s.parentId);
    childIndexMap.set(s.id, siblings.indexOf(s));
  });
  const topIndexMap = new Map<string, number>();
  topLevel.forEach((s, i) => topIndexMap.set(s.id, i + 1));

  return (
    <Background>
      <section className="py-28 lg:py-32 lg:pt-44">
        <div className="container max-w-5xl">
          <h1 className="text-3xl tracking-tight sm:text-4xl md:text-5xl">
            Live demo
          </h1>
          <p className="text-muted-foreground mt-4 max-w-3xl text-lg md:text-xl">
            Open the side panel on this page and try every feature with the
            demo targets below — no recordings, the canvas is the real thing.
          </p>
        </div>

        <div className={`${styles.extensionBannerWrap} container mt-10 max-w-5xl`}>
          <ExtensionDetected />
        </div>

        <div className={`${styles.demoLayout} container mt-10 max-w-5xl`}>
          <DemoLeftNav />

          <main className={styles.content}>
            {STEPS.map((step) => {
              const isChild = !!step.parentId;
              const index = isChild ? 0 : topIndexMap.get(step.id) ?? 0;
              const childIdx = isChild ? childIndexMap.get(step.id) ?? 0 : 0;
              const childLetter = isChild
                ? String.fromCharCode("a".charCodeAt(0) + childIdx)
                : undefined;
              return (
                <DemoStep
                  key={step.id}
                  step={step}
                  index={index}
                  childLetter={childLetter}
                >
                  {renderDemoTarget(step.targetId)}
                </DemoStep>
              );
            })}
          </main>
        </div>
      </section>
    </Background>
  );
}
