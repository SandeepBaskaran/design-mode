import {
  CONTENT_WIDTH,
  type ContentWidth,
  PageSection,
} from "@/components/layout/page-section";
import { cn } from "@/lib/utils";

const DESCRIPTION_WIDTH: Record<ContentWidth, string | undefined> = {
  "3xl": "max-w-2xl",
  "4xl": undefined,
  "5xl": "max-w-3xl",
};

type PageHeroProps = {
  title: React.ReactNode;
  description: React.ReactNode;
  eyebrow?: React.ReactNode;
  width?: ContentWidth;
  spacing?: "default" | "spacious";
  descriptionClassName?: string;
  children?: React.ReactNode;
};

export function PageHero({
  title,
  description,
  eyebrow,
  width = "5xl",
  spacing = "default",
  descriptionClassName,
  children,
}: PageHeroProps) {
  return (
    <PageSection
      tone="hero"
      className={spacing === "spacious" ? "py-16 lg:py-24" : undefined}
      data-ds="PageHero"
    >
      <div className={cn("container", CONTENT_WIDTH[width])}>
        {eyebrow && (
          <div className="text-muted-foreground mb-4 text-base font-medium tracking-wide uppercase">
            {eyebrow}
          </div>
        )}
        <h1 className="text-3xl tracking-tight sm:text-4xl md:text-5xl">
          {title}
        </h1>
        <p
          className={cn(
            "text-muted-foreground mt-4",
            DESCRIPTION_WIDTH[width],
            "text-base",
            descriptionClassName,
          )}
        >
          {description}
        </p>
        {children}
      </div>
    </PageSection>
  );
}
