import { Background } from "@/components/background";
import { DashedLine } from "@/components/dashed-line";
import { cn } from "@/lib/utils";

const PADDING = {
  hero: "py-12 lg:py-16",
  body: "py-16 lg:py-20",
  bottom: "py-20 lg:py-28",
} as const;

export const CONTENT_WIDTH = {
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
} as const;

export type ContentWidth = keyof typeof CONTENT_WIDTH;

type PageSectionProps = {
  tone: keyof typeof PADDING;
  width?: ContentWidth;
  className?: string;
  children: React.ReactNode;
  "data-ds"?: string;
};

// hero and bottom sit on a Background slab; body and bottom open with a DashedLine.
export function PageSection({
  tone,
  width = "5xl",
  className,
  children,
  "data-ds": outer,
}: PageSectionProps) {
  const ds = outer ? `${outer} PageSection` : "PageSection";
  const section = (
    <section
      className={cn(PADDING[tone], className)}
      data-ds={tone === "body" ? ds : undefined}
    >
      {tone !== "hero" && (
        <DashedLine className={cn("container", CONTENT_WIDTH[width])} />
      )}
      {children}
    </section>
  );
  if (tone === "body") return section;
  return (
    <Background variant={tone === "bottom" ? "bottom" : "top"} data-ds={ds}>
      {section}
    </Background>
  );
}
