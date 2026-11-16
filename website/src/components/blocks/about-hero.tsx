import Link from "next/link";

export function AboutHero() {
  return (
    <section>
      <div className="container max-w-5xl">
        <h1 className="text-3xl tracking-tight sm:text-4xl md:text-5xl">
          About Sandeep
        </h1>
        <p className="text-muted-foreground mt-4 max-w-3xl text-base">
          Sandeep Baskaran is a Senior UX Designer in Bengaluru, working in
          IBM&apos;s Z Infrastructure organisation.{" "}
          <Link href="/" className="underline underline-offset-4">
            Design Mode
          </Link>{" "}
          is his independent, MIT-licensed browser extension. It previews
          changes on a rendered page and records a specification. Someone with
          repository access implements the source.
        </p>
      </div>
    </section>
  );
}
