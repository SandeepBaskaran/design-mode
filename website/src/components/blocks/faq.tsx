import Link from "next/link";

import { FaqAnswer } from "@/components/site/faq-answer";
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
    <section className="py-16 md:py-24 lg:py-32">
      <div className="container max-w-5xl">
        <div className="mb-12 space-y-4 text-center lg:mb-16">
          <h2 className="text-2xl tracking-tight md:text-4xl lg:text-5xl">
            Questions before you install
          </h2>
          <p className="text-muted-foreground mx-auto max-w-2xl leading-relaxed">
            <Link href="/faq" className="underline underline-offset-8">
              Read the full FAQ
            </Link>{" "}
            for MCP, storage and privacy.
          </p>
        </div>

        <Accordion
          type="single"
          collapsible
          className="mx-auto w-full max-w-4xl"
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
