import Link from "next/link";
import { Footer } from "../Footer";
import { TopNav } from "../TopNav";

export const metadata = {
  title: "Hosted MCP · Design Mode",
  description:
    "Paste one URL and a token into Claude Desktop or Cursor. Your edits in the browser flow straight into your coding agent — no terminal, no local server.",
};

const claudeConfig = `{
  "mcpServers": {
    "design-mode": {
      "type": "http",
      "url": "https://mcp.designmode.app/api/mcp",
      "headers": { "Authorization": "Bearer dm_<your-token>" }
    }
  }
}`;

const cursorConfig = `{
  "design-mode": {
    "url": "https://mcp.designmode.app/api/mcp",
    "headers": { "Authorization": "Bearer dm_<your-token>" }
  }
}`;

export default function McpPage() {
  return (
    <>
      <article className="article">
        <header>
          <TopNav />
          <div className="hero" style={{ paddingTop: "2.5rem", paddingBottom: "1.5rem" }}>
            <h1>Hosted MCP</h1>
            <p className="tagline">
              The same MCP bridge as the local server — with no terminal. Install the
              extension, click <em>Connect to Cloud</em>, paste the snippet into your
              agent, restart it.
            </p>
          </div>
        </header>

        <section>
          <h2>How it works</h2>
          <p>
            Your token is generated anonymously the first time you click{' '}
            <em>Connect to Cloud</em> in the side panel. The cloud server is a stateless
            relay: when your agent calls a Design Mode tool, the request is forwarded
            to your browser&apos;s active tab over a Server-Sent Events stream. Your
            browser does the work and the answer flows back the same way.
          </p>
          <p>
            <strong>Side panel must stay open</strong> for the agent to reach this browser.
            Closing the side panel pauses cloud calls until you reopen it. We chose this
            over silent wake-up to keep the experience predictable and the relay cheap.
          </p>
        </section>

        <section>
          <h2>Claude Desktop</h2>
          <p>
            Edit <code>~/Library/Application Support/Claude/claude_desktop_config.json</code>{' '}
            (macOS) or <code>%APPDATA%\Claude\claude_desktop_config.json</code> (Windows)
            and add this entry:
          </p>
          <pre><code>{claudeConfig}</code></pre>
          <p>Restart Claude Desktop. The Design Mode tools will appear in the agent&apos;s tool drawer.</p>
        </section>

        <section>
          <h2>Cursor</h2>
          <p>
            Open Cursor settings → MCP and add a new server with this snippet (the side
            panel&apos;s <em>Copy Cursor config</em> button generates an exact copy):
          </p>
          <pre><code>{cursorConfig}</code></pre>
        </section>

        <section>
          <h2>Privacy</h2>
          <p>
            The relay is designed to be transparent: payloads are written to short-lived
            Redis Streams (trimmed within ~60 seconds) and never persisted. Application
            logs carry only metadata — token id, message type, byte counts, latency —
            never selectors, payload bodies, or screenshots. We don&apos;t train models
            on your data. Read the full{' '}
            <Link href="/privacy">privacy policy</Link>.
          </p>
          <p>
            Tokens can be revoked from the side panel at any time. Lost a device? Click
            Revoke, the row is deleted, and the active stream drops on the next
            heartbeat.
          </p>
        </section>

        <section>
          <h2>Prefer to self-host?</h2>
          <p>
            Pick <em>Self-hosted</em> in the side panel&apos;s MCP settings and point the
            URL at your own Vercel deployment of the open-source{' '}
            <a href="https://github.com/SandeepBaskaran/design-mode" target="_blank" rel="noreferrer">
              <code>@design-mode/mcp-cloud</code>
            </a>{' '}
            package. Same wire protocol, your infra, your privacy posture.
          </p>
        </section>

        <Footer />
      </article>
    </>
  );
}
