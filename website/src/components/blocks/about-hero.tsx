import Link from "next/link";

export function AboutHero() {
  return (
    <section data-ds="AboutHero">
      <div className="container max-w-5xl">
        <h1 className="text-3xl tracking-tight sm:text-4xl md:text-5xl">
          About DIVE
        </h1>
        <p className="text-muted-foreground mt-4 max-w-5xl text-base">
          DIVE stands for Design Intelligence &amp; Visual Engineering. It is an
          MIT-licensed browser extension for editing live web pages visually:
          you adjust styles, text and layout on the rendered page, and DIVE
          records those edits as a structured specification that a coding agent
          receives through MCP or as Markdown. The agent implements the source
          change; you review the diff. Read the{" "}
          <Link href="/changelog" className="underline underline-offset-4">
            release history
          </Link>{" "}
          and the{" "}
          <Link
            href="/blog/why-we-built-an-mcp-server-for-design-edits"
            className="underline underline-offset-4"
          >
            MCP design rationale
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
