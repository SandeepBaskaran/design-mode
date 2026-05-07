import { Footer } from "../Footer";
import { TopNav } from "../TopNav";

export const metadata = {
  title: "Privacy · Design Mode",
  description:
    "Design Mode's privacy stance for the hosted MCP relay: ephemeral, no payload persistence, no training on your data.",
};

export default function PrivacyPage() {
  return (
    <>
      <article className="article">
        <header>
          <TopNav />
          <div className="hero" style={{ paddingTop: "2.5rem", paddingBottom: "1.5rem" }}>
            <h1>Privacy</h1>
            <p className="tagline">
              The hosted MCP relay at <code>mcp.designmode.app</code> is a thin pass-through
              between your coding agent and your browser. This page explains exactly what
              flows through, what we keep, and what we don&apos;t.
            </p>
          </div>
        </header>

        <section>
          <h2>What flows through the relay</h2>
          <p>
            When you ask your agent to call a Design Mode tool — for example,{' '}
            <code>get_changes</code> or <code>get_screenshot</code> — the request travels
            agent → relay → your browser, and the response travels back the same way.
            That means CSS edits, page selectors, and on-demand screenshots transit our
            servers in flight.
          </p>
        </section>

        <section>
          <h2>What we keep</h2>
          <ul>
            <li>
              <strong>Tokens (hashed).</strong> Your device token is stored in Vercel KV
              as an SHA-256 hash. We never see the plaintext after registration.
            </li>
            <li>
              <strong>Connection metadata.</strong> Tenant id, message type, byte
              counts, and latency. No selectors, no payload bodies, no screenshots.
            </li>
          </ul>
        </section>

        <section>
          <h2>What we don&apos;t keep</h2>
          <ul>
            <li>
              <strong>Payload bodies.</strong> Messages flow through Upstash Redis Streams
              capped at 100 entries and ~60 seconds. After the agent reads its response,
              the payload is gone.
            </li>
            <li>
              <strong>Application logs.</strong> Stripped to metadata only at the source.
              Code review enforces the rule any time a new route is added.
            </li>
            <li>
              <strong>Training data.</strong> We don&apos;t train models on your edits or
              screenshots. The relay is operations-only.
            </li>
          </ul>
        </section>

        <section>
          <h2>Revocation and recovery</h2>
          <p>
            Click <em>Revoke token</em> in the side panel and the token row is deleted
            immediately. The active SSE stream for that token drops on the next
            heartbeat (within 25 seconds). Lost the token? Generate a new one — there&apos;s
            no recovery flow because there&apos;s no account.
          </p>
        </section>

        <section>
          <h2>Self-hosted alternative</h2>
          <p>
            The whole relay is open source. Deploy your own copy of{' '}
            <code>@design-mode/mcp-cloud</code> on Vercel, point the extension at your
            URL, and the relay never touches our infrastructure.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            Questions about this stance, or noticed something that contradicts it?
            Email <a href="mailto:hello@sandeepbaskaran.com">hello@sandeepbaskaran.com</a>.
          </p>
        </section>

        <Footer />
      </article>
    </>
  );
}
