import type { ReactNode } from "react";

export const sectionPadding = "py-12 md:py-16";
export const sectionGap = "mt-10";

type SectionHeaderProps = {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  id?: string;
  as?: "h1" | "h2";
};

export function SectionHeader({
  eyebrow,
  title,
  description,
  id,
  as = "h2",
}: SectionHeaderProps) {
  const Title = as;
  return (
    <header className="mx-auto max-w-[60ch] text-center">
      <p className="text-muted-foreground text-sm font-medium tracking-[0.14em] uppercase">
        {eyebrow}
      </p>
      <Title
        id={id}
        className="mt-3 text-2xl tracking-tight md:text-4xl lg:text-5xl"
      >
        {title}
      </Title>
      {description ? (
        <p className="text-muted-foreground mt-4 text-base leading-relaxed">
          {description}
        </p>
      ) : null}
    </header>
  );
}
