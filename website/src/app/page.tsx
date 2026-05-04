import { Footer } from "./Footer";
import { TopNav } from "./TopNav";

export default function OverviewPage() {
  return (
    <>
      <article className="article">
        <header>
          <TopNav />
          <div className="hero">
            <h1>
              Design directly in your browser.<br />
              Your agent writes the code.
            </h1>
            <p className="tagline">
              Rework layout, type, colour, and structure on any live site, then ship the result
              straight to Claude Code, Cursor, or any AI coding agent. No mock files, no copy-paste.
            </p>
          </div>
        </header>

        <figure className="hero-cover">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cover.png" alt="Design Mode side panel running on a live website" />
        </figure>

        <section style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <p>
            Design Mode is an <strong>open-source project</strong> &mdash; the full source is on{" "}
            <a href="https://github.com/SandeepBaskaran/design-mode" target="_blank" rel="noopener noreferrer">GitHub</a>.
            Free for personal and professional use; fork it, extend it, ship it.{" "}
            <a href="mailto:hello@sandeepbaskaran.com">Get in touch</a> for custom integrations or enterprise support.
          </p>
        </section>
      </article>

      <Footer />
    </>
  );
}
