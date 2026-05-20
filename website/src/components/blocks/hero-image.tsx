import Image from "next/image";

// Wide marketing screenshot — the live website with the side panel
// attached. Sits between the hero CTAs and the HeroShowcase row to
// give the user a "see it in context" before the bullets + close-up.
export function HeroImage() {
  return (
    <section className="py-16 lg:py-24">
      <div className="container max-w-5xl">
        <Image
          src="/hero.png"
          alt="Design Mode in action — the live website with the side panel attached"
          width={2360}
          height={951}
          className="rounded-2xl border shadow-lg"
          priority
        />
      </div>
    </section>
  );
}
