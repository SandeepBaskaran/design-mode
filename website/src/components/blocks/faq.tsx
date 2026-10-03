import Link from "next/link";

import { ChevronDown } from "lucide-react";

import { homepageFaqQA } from "@/content/product-facts";

export { homepageFaqQA } from "@/content/product-facts";

export function FAQItems({
  items,
  name,
}: {
  items: ReadonlyArray<{ question: string; answer: string }>;
  name: string;
}) {
  return items.map((item) => (
    <details key={item.question} name={name} className="group border-b">
      <summary className="focus-visible:outline-ring flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left text-base font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 [&::-webkit-details-marker]:hidden">
        {item.question}
        <ChevronDown
          aria-hidden="true"
          className="text-muted-foreground size-4 shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="text-muted-foreground pb-4 text-base leading-relaxed">
        {item.answer}{" "}
        {item.question === "Which browsers are supported?" && (
          <Link href="/docs/browser-support" className="underline underline-offset-4">
            Browser support and install paths
          </Link>
        )}
        {item.question === "What data leaves my machine by default?" && (
          <Link href="/privacy" className="underline underline-offset-4">
            Privacy details
          </Link>
        )}
      </div>
    </details>
  ));
}

export const FAQ = () => {
  return (
    <section className="py-32">
      <div className="container max-w-5xl">
        <div className="mb-12 space-y-4 text-center lg:mb-16">
          <h2 className="text-2xl tracking-tight md:text-4xl lg:text-5xl">
            Questions before you install
          </h2>
          <p className="text-muted-foreground mx-auto max-w-2xl leading-relaxed">
            The short version of how Design Mode edits a rendered page, hands
            changes to an agent, and handles browser data. Read the{" "}
            <Link href="/faq" className="underline underline-offset-8">
              complete FAQ
            </Link>{" "}
            for details.
          </p>
        </div>

        <div className="mx-auto w-full max-w-4xl">
          <FAQItems items={homepageFaqQA} name="homepage-faq" />
        </div>

        <p className="text-muted-foreground mt-10 text-center text-base">
          Still unsure?{" "}
          <Link href="/contact" className="underline underline-offset-8">
            Ask a specific question
          </Link>
          .
        </p>
      </div>
    </section>
  );
};
