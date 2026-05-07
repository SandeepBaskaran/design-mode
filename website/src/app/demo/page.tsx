import { Footer } from "../Footer";
import { TopNav } from "../TopNav";
import { DemoLeftNav } from "./DemoLeftNav";
import { DemoStep } from "./DemoStep";
import { ExtensionDetected } from "./ExtensionDetected";
import { renderDemoTarget } from "./DemoTargets";
import { STEPS } from "./steps";
import styles from "./demo.module.scss";

export const metadata = {
  title: "Demo · Design Mode",
  description:
    "Live, interactive walkthrough of every Design Mode feature. The page itself is the canvas — open the side panel and edit it.",
};

export default function DemoPage() {
  // Number top-level steps 1..N; sub-steps get a/b/c… letters under their parent.
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
    <>
      <article className="article">
        <header>
          <TopNav />
          <div className="hero" style={{ paddingTop: "2.5rem", paddingBottom: "1.5rem" }}>
            <h1>Live demo</h1>
            <p className="tagline">
              Open the side panel on this page and try every feature with the
              demo targets below — no recordings, the canvas is the real thing.
            </p>
          </div>
        </header>
      </article>

      <div className={styles.extensionBannerWrap}>
        <ExtensionDetected />
      </div>

      <div className={styles.demoLayout}>
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

      <Footer />
    </>
  );
}
