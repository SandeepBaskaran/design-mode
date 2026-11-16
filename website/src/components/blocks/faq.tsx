import Link from "next/link";

import { FaqAnswer } from "@/components/site/faq-answer";
import { SectionHeader, sectionGap, sectionPadding } from "@/components/site/section-header";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { homepageFaqQA } from "@/content/product-facts";

export { homepageFaqQA } from "@/content/product-facts";

export const FAQ = () => {
  return (
    <section id="faq" className={`scroll-mt-24 ${sectionPadding}`}>
      <div className="container max-w-5xl">
        <SectionHeader
          eyebrow="FAQ"
          title="Before you install"
          description="What it edits, which pages it can reach, and how a change gets to your agent."
        />

        <Accordion
          type="single"
          collapsible
          className={`mx-auto w-full max-w-4xl ${sectionGap}`}
        >
          {homepageFaqQA.map((item, index) => (
            <AccordionItem key={item.question} value={`faq-${index}`}>
              <AccordionTrigger className="text-left">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">
                <FaqAnswer qa={item} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <p className="text-muted-foreground mt-10 text-center text-base">
          Still unsure?{" "}
          <Link href="/#contact" className="underline underline-offset-8">
            Ask a specific question
          </Link>
          .
        </p>
      </div>
    </section>
  );
};
