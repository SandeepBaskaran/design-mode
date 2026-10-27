import type { Metadata } from "next";

import { DesignSystem } from "./design-system";

export const metadata: Metadata = {
  title: { absolute: "Design system — Design Mode" },
  robots: { index: false, follow: false, nocache: true },
};

export default function DesignSystemPage() {
  return <DesignSystem />;
}
