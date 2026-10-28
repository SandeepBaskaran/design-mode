import { notFound } from "next/navigation";

import type { Metadata } from "next";

import { analyze } from "./analysis";
import { DesignSystem } from "./design-system";
import { Gallery } from "./gallery";

export const metadata: Metadata = {
  title: { absolute: "Design system — DIVE" },
  robots: { index: false, follow: false, nocache: true },
};

export default function DesignSystemPage() {
  // It renders source paths and line numbers, so production builds opt in explicitly.
  if (process.env.NODE_ENV === "production" && process.env.DESIGN_SYSTEM_ENABLED !== "1") notFound();
  const { components, pages } = analyze();
  return <DesignSystem gallery={<Gallery components={components} />} pages={pages} components={components} />;
}
