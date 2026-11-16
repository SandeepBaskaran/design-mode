import Link from "next/link";

import { AgentIcons } from "@/components/blocks/hero-headline";
import { AddToChromeCta } from "@/components/site/add-to-chrome-cta";
import { SectionHeader } from "@/components/site/section-header";
import { Button } from "@/components/ui/button";

export function ClosingCta() {
  return (
    <section aria-labelledby="closing-cta-heading" className="py-16 md:py-24 lg:py-32">
      <div className="container text-center">
        <SectionHeader
          eyebrow="From intent to implementation"
          id="closing-cta-heading"
          title="Less explaining. More making."
          description="Make the change in your browser. Give your agent the details to carry it into code."
        />
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <AddToChromeCta
            size="lg"
            className="h-14 max-sm:w-full max-sm:max-w-xs"
          />
          <Button
            asChild
            variant="outline"
            size="lg"
            className="h-14 max-sm:w-full max-sm:max-w-xs"
          >
            <Link href="/mcp">
              <AgentIcons size={16} />
              Connect your agent
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
