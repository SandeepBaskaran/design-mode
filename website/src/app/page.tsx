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

        <section className="overview-row">
          <figure className="hero-cover">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/cover.png" alt="Design Mode side panel running on a live website" />
          </figure>

          <div className="overview-content">
            <p>
              Design Mode is an <strong>open-source project</strong> &mdash; the full source is on{" "}
              <a href="https://github.com/SandeepBaskaran/design-mode" target="_blank" rel="noopener noreferrer">GitHub</a>.
              Free for personal and professional use; fork it, extend it, ship it.{" "}
              <a href="mailto:hello@sandeepbaskaran.com">Get in touch</a> for custom integrations or enterprise support.
            </p>

            <ul className="feature-list">
              <li>Stop describing UI changes in chat. Drag, click, type — your agent reads your edits as a real diff, not a screenshot.</li>
              <li>One click sends the selected element, computed styles, and your changes to Claude Code or Cursor as a ready-to-run prompt.</li>
              <li>Bring your agent inside the page via the built-in MCP server &mdash; it inspects styles and applies changes while you watch.</li>
              <li>Works on the URL already in your tab: localhost, staging, or production. No Storybook, no mock files.</li>
              <li>Tighten a layout in seconds, then commit the patch. The vibe-coding loop, minus the back-and-forth.</li>
            </ul>
          </div>
        </section>
      </article>

      <Footer />
    </>
  );
}
