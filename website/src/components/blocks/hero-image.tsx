import Image from "next/image";

// Wide marketing screenshot — the live website with the side panel
// attached. Sits at the bottom of the homepage (after the FAQ slab,
// just above the footer) as a closing "see it in context" shot.
export function HeroImage() {
  return (
    <section className="py-16 lg:py-24">
      <div className="container max-w-5xl">
        <div className="border-border bg-card overflow-hidden rounded-2xl border shadow-lg">
          <Image
            src="/hero.png"
            alt="Design Mode in action — the live website with the side panel attached"
            width={2360}
            height={951}
            className="h-auto w-full"
          />
        </div>
      </div>
    </section>
  );
}
