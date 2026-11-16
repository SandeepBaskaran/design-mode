import Link from "next/link";

const audiences = [
  {
    title: "Designers and design engineers",
    text: "Make the intended change on the rendered page.",
  },
  {
    title: "Developers with a coding agent",
    text: "Hand the recorded changes to Claude Code, Cursor or another compatible client, then review the source diff.",
  },
  {
    title: "QA, content and product",
    text: "Export precise visual feedback. The extension does not write the code.",
  },
];

export function WhoItsFor() {
  return (
    <section aria-labelledby="who-heading" className="py-16 md:py-24 lg:py-32">
      <div className="container max-w-5xl">
        <div className="mx-auto max-w-3xl text-center">
          <h2
            id="who-heading"
            className="text-2xl tracking-tight md:text-4xl lg:text-5xl"
          >
            Who it’s for
          </h2>
          <p className="mt-6 text-base">
            <Link href="/solutions" className="underline underline-offset-8">
              See the jobs
            </Link>
          </p>
        </div>
        <ul className="mt-10 grid gap-8 text-left md:grid-cols-3">
          {audiences.map((audience) => (
            <li key={audience.title}>
              <h3 className="text-2xl font-semibold">{audience.title}</h3>
              <p className="text-muted-foreground mt-3 text-base leading-relaxed">
                {audience.text}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
