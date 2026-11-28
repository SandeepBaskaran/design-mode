"use client";

import styles from "./demo.module.scss";
import { DemoStep } from "./DemoStep";
import { renderDemoTarget } from "./DemoTargets";
import { getStepsForBrowser } from "./steps";

import { useInstallTarget } from "@/hooks/use-install-target";

export function DemoStepsList() {
  const target = useInstallTarget();
  const steps = getStepsForBrowser(target);

  return (
    <div className={styles.content} aria-label="Demo steps">
      {steps.map((step) => (
        <DemoStep key={step.id} step={step}>
          {renderDemoTarget(step.targetId)}
        </DemoStep>
      ))}
    </div>
  );
}
