"use client";

import { useEffect, useState } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useCases } from "@/content/use-cases";

function audiencePills(persona: string) {
  return persona
    .split(/\s+and\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function slugFromHash() {
  const slug = decodeURIComponent(window.location.hash.replace(/^#/, ""));
  return useCases.some((item) => item.slug === slug) ? slug : undefined;
}

export function SolutionsAccordion() {
  const [open, setOpen] = useState<string>();

  useEffect(() => {
    const apply = () => setOpen(slugFromHash());
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  return (
    <Accordion
      type="single"
      collapsible
      value={open ?? ""}
      onValueChange={(value) => setOpen(value || undefined)}
      className="mt-12 w-full"
    >
      {useCases.map((item) => (
        <AccordionItem
          key={item.slug}
          value={item.slug}
          id={item.slug}
          className="scroll-mt-24"
        >
          <AccordionTrigger className="text-left text-xl font-semibold">
            {item.title}
          </AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-wrap gap-2">
              {audiencePills(item.persona).map((label) => (
                <span
                  key={label}
                  className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-sm"
                >
                  {label}
                </span>
              ))}
            </div>
            <p className="text-muted-foreground mt-3 text-base leading-relaxed">
              {item.summary}
            </p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
