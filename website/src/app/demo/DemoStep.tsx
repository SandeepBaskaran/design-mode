import Link from "next/link";
import type { Step } from "./steps";
import styles from "./demo.module.scss";

type Props = {
  step: Step;
  index: number;          // overall position (1-based) — only used for top-level steps' visible numbering
  childLetter?: string;   // a/b/c/… for Design sub-sections
  children?: React.ReactNode;
};

// Single step card: numbered title, body paragraphs, "Try it" callout,
// and an optional slot below for the demo target component.
export function DemoStep({ step, index, childLetter, children }: Props) {
  const isChild = !!step.parentId;
  const number = isChild ? childLetter : String(index);
  return (
    <section
      id={step.id}
      data-step-id={step.id}
      className={`${styles.step} ${isChild ? styles.stepChild : ""}`}
    >
      <header className={styles.stepHeader}>
        {number && (
          <span
            className={isChild ? styles.stepLetter : styles.stepNumber}
            aria-hidden="true"
          >
            {number}
          </span>
        )}
        <h2 className={styles.stepTitle}>{step.title}</h2>
      </header>
      <div className={styles.stepBody}>
        {step.body.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {step.tryIt && (
        <div className={styles.tryIt} role="note">
          <span className={styles.tryItLabel}>Try it</span>
          <span className={styles.tryItBody}>{step.tryIt}</span>
        </div>
      )}
      {children && <div className={styles.stepTarget}>{children}</div>}
      {step.nextLink && (
        <div style={{ marginTop: '0.75rem' }}>
          <Link href={step.nextLink.href}>{step.nextLink.label}</Link>
        </div>
      )}
    </section>
  );
}
