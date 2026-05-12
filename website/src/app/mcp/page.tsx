import Link from "next/link";
import { Footer } from "../Footer";
import { TopNav } from "../TopNav";

export const metadata = {
  title: "MCP · Design Mode",
  description:
    "Three ways to connect your AI agent to Design Mode — Local, Cloud, or Self-hosted. Step-by-step setup for Claude Desktop, Cursor, and Claude Code.",
};

// Snippet helpers — same JSON shape per mode, just different URLs.
const localClaude = `{
  "mcpServers": {
    "design-mode": {
      "command": "npx",
      "args": ["-y", "@design-mode/mcp-local"]
    }
  }
}`;

const localCursor = `{
  "design-mode": {
    "command": "npx",
    "args": ["-y", "@design-mode/mcp-local"]
  }
}`;

const cloudClaude = `{
  "mcpServers": {
    "design-mode": {
      "type": "http",
      "url": "https://mcp.designmode.app/mcp",
      "headers": { "Authorization": "Bearer dm_<your-token>" }
    }
  }
}`;

const cloudCursor = `{
  "design-mode": {
    "url": "https://mcp.designmode.app/mcp",
    "headers": { "Authorization": "Bearer dm_<your-token>" }
  }
}`;

const selfClaude = `{
  "mcpServers": {
    "design-mode": {
      "type": "http",
      "url": "https://<your-deploy>.vercel.app/mcp",
      "headers": { "Authorization": "Bearer dm_<your-token>" }
    }
  }
}`;

const selfCursor = `{
  "design-mode": {
    "url": "https://<your-deploy>.vercel.app/mcp",
    "headers": { "Authorization": "Bearer dm_<your-token>" }
  }
}`;

export default function McpPage() {
  return (
    <>
      <article className="article">
        <header>
          <TopNav variant="mcp" />
          <div className="hero" style={{ paddingTop: "2.5rem", paddingBottom: "1.5rem" }}>
            <h1>Connect your AI agent</h1>
            <p className="tagline">
              Design Mode talks to Claude Desktop, Cursor, Claude Code, or any
              MCP-aware agent. Pick one of three connection modes, paste the
              snippet, restart your agent.
            </p>
          </div>
        </header>

        <section>
          <h2>Three modes at a glance</h2>
          <p>
            Each mode exposes the <strong>same six MCP tools</strong>
            (<code>get_changes</code>, <code>apply_changes</code>,{' '}
            <code>clear_changes</code>, <code>get_session_summary</code>,{' '}
            <code>export_changes</code>, <code>get_screenshot</code>) — pick
            based on where the agent runs and what you&apos;re willing to
            operate.
          </p>
          <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
            <table className="modes-table">
              <thead>
                <tr>
                  <th>Mode</th>
                  <th>When to use</th>
                  <th>Server runs on</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><a href="#local"><strong>Local</strong></a></td>
                  <td>You + your laptop. Fastest path, no account.</td>
                  <td>Your machine (<code>npx</code>)</td>
                  <td>Free</td>
                </tr>
                <tr>
                  <td><a href="#cloud"><strong>Cloud</strong></a></td>
                  <td>You + a remote agent (e.g. ChatGPT in browser, hosted Claude).</td>
                  <td><code>mcp.designmode.app</code></td>
                  <td>Free, per-tenant daily quota</td>
                </tr>
                <tr>
                  <td><a href="#self-hosted"><strong>Self-hosted</strong></a></td>
                  <td>You want to own the relay (privacy, compliance, custom quotas).</td>
                  <td>Your Vercel project + Upstash Redis</td>
                  <td>Free tier of Vercel + Upstash</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="local">
          <h2>Mode 1 — Local</h2>
          <p>
            The default. Your agent talks to a Node.js companion server running
            on your laptop, which in turn talks to the browser extension over a
            WebSocket. Everything stays on the machine — nothing leaves
            localhost.
          </p>

          <h3>Setup</h3>
          <ol>
            <li>
              Install the extension from the{' '}
              <a
                href="https://chromewebstore.google.com/detail/design-mode/ighgobegfcmjagombgnfhgioflinojih"
                target="_blank"
                rel="noreferrer"
              >
                Chrome Web Store
              </a>
              .
            </li>
            <li>
              Open Settings → MCP, confirm the mode is <strong>Local</strong>{' '}
              (default).
            </li>
            <li>
              Add one of the snippets below to your agent&apos;s MCP config and
              restart the agent. The extension will auto-connect on{' '}
              <code>ws://localhost:9960</code> when the side panel is open.
            </li>
          </ol>

          <h3>Claude Desktop</h3>
          <p>
            Edit <code>~/Library/Application Support/Claude/claude_desktop_config.json</code>{' '}
            (macOS) or <code>%APPDATA%\Claude\claude_desktop_config.json</code>{' '}
            (Windows):
          </p>
          <pre><code>{localClaude}</code></pre>

          <h3>Cursor</h3>
          <p>Cursor Settings → MCP → add server:</p>
          <pre><code>{localCursor}</code></pre>

          <h3>Claude Code</h3>
          <p>
            Run <code>claude mcp add design-mode npx -y @design-mode/mcp-local</code>{' '}
            from any terminal. Restart Claude Code.
          </p>

          <h3>Troubleshooting</h3>
          <ul>
            <li>
              <strong>Port conflict on 9960</strong> — set{' '}
              <code>DM_PORT=&lt;port&gt;</code> in your environment, and change
              the port in extension Settings → MCP to match.
            </li>
            <li>
              <strong>Indicator stays grey</strong> — make sure the side panel
              is open in at least one tab. The companion server only forwards
              while a panel is connected.
            </li>
            <li>
              <strong>Agent can&apos;t see the tools</strong> — fully quit and
              relaunch your agent after editing the config. Some agents cache
              the MCP list.
            </li>
          </ul>
        </section>

        <section id="cloud">
          <h2>Mode 2 — Cloud (mcp.designmode.app)</h2>
          <p>
            For remote agents that can&apos;t reach your laptop — hosted
            Claude, ChatGPT&apos;s browser tool calls, a teammate on another
            machine, etc. The relay is a stateless Vercel deployment with
            Upstash Redis Streams; payloads are trimmed within ~60 seconds and
            never persisted.
          </p>

          <h3>Setup</h3>
          <ol>
            <li>
              In the extension, open Settings → MCP → switch mode to{' '}
              <strong>Cloud</strong>.
            </li>
            <li>
              Click <em>Connect to Cloud</em>. A bearer token{' '}
              (<code>dm_…</code>) and tenant id are generated and stored in{' '}
              <code>chrome.storage.local</code>.
            </li>
            <li>
              Click <em>Copy Claude / Cursor / Claude Code config</em> to put
              the right snippet on your clipboard with the token already
              substituted.
            </li>
            <li>Paste into the agent&apos;s MCP config and restart.</li>
          </ol>

          <h3>Claude Desktop</h3>
          <pre><code>{cloudClaude}</code></pre>

          <h3>Cursor</h3>
          <pre><code>{cloudCursor}</code></pre>

          <h3>Claude Code</h3>
          <p>
            Use <code>claude mcp add --transport http design-mode https://mcp.designmode.app/mcp --header "Authorization: Bearer dm_&lt;your-token&gt;"</code>.
          </p>

          <h3>Quota &amp; privacy</h3>
          <ul>
            <li>
              <strong>Per-tenant daily quota</strong> — currently 25 tool calls
              per UTC day. Raise on request; the relay rejects overage with
              an explicit 429.
            </li>
            <li>
              <strong>Stream-only</strong> — your edits and screenshots flow
              through Redis Streams that are trimmed within ~60 seconds and
              not persisted to durable storage.
            </li>
            <li>
              <strong>Tokens are revocable</strong> — Revoke from the side
              panel and the active stream drops on the next heartbeat.
            </li>
            <li>
              <strong>Side panel must stay open</strong> for the agent to
              reach your browser. Closing it pauses cloud calls.
            </li>
          </ul>
        </section>

        <section id="self-hosted">
          <h2>Mode 3 — Self-hosted</h2>
          <p>
            Same wire protocol as Cloud, your infra. Useful if you want to
            audit the relay, set your own quotas, or keep the bridge inside a
            corporate network.
          </p>

          <h3>Setup</h3>
          <ol>
            <li>
              Clone the repo and open{' '}
              <code>packages/mcp-cloud/</code>.
            </li>
            <li>
              Provision an Upstash Redis from the{' '}
              <a
                href="https://vercel.com/marketplace/upstash"
                target="_blank"
                rel="noreferrer"
              >
                Vercel Marketplace
              </a>
              .
            </li>
            <li>
              Set environment variables: <code>KV_*</code> (auto-populated by
              the Marketplace integration), <code>DM_DAILY_QUOTA</code>{' '}
              (default 25), and any custom CORS origins you need.
            </li>
            <li>
              Deploy with <code>vercel deploy --prod</code>. Copy the
              production URL (e.g.{' '}
              <code>https://design-mode-mcp-yourname.vercel.app</code>).
            </li>
            <li>
              In the extension, Settings → MCP → switch mode to{' '}
              <strong>Self-hosted</strong>, paste your URL, click{' '}
              <em>Connect</em>. Token + tenant generation works the same as
              Cloud.
            </li>
          </ol>

          <h3>Claude Desktop</h3>
          <pre><code>{selfClaude}</code></pre>

          <h3>Cursor</h3>
          <pre><code>{selfCursor}</code></pre>

          <h3>Claude Code</h3>
          <p>
            Same as Cloud but with your URL:{' '}
            <code>claude mcp add --transport http design-mode https://&lt;your-deploy&gt;.vercel.app/mcp --header "Authorization: Bearer dm_&lt;your-token&gt;"</code>.
          </p>
        </section>

        <section>
          <h2>The six MCP tools your agent gets</h2>
          <ul>
            <li>
              <code>get_changes</code> — full snapshot of every edit on the
              current page (styles, text, DOM, comments) + the page URL/title.
            </li>
            <li>
              <code>apply_changes</code> — agent pushes styles to specific
              elements; they paint live and land in the Changes tab.
            </li>
            <li>
              <code>clear_changes</code> — wipe all edits on the current page.
            </li>
            <li>
              <code>get_session_summary</code> — short summary across every
              active session (extension status + change counts).
            </li>
            <li>
              <code>export_changes</code> — generate CSS / Tailwind / SCSS /
              JSX from the current change set.
            </li>
            <li>
              <code>get_screenshot</code> — PNG of the viewport or a single
              element (by selector or <code>dm-*</code> id).
            </li>
          </ul>
        </section>

        <section>
          <h2>Privacy</h2>
          <p>
            Local mode never leaves your machine. Cloud and Self-hosted modes
            stream through a relay that&apos;s designed to be transparent —
            payloads are short-lived Redis entries (trimmed within ~60s) and
            never persisted; logs carry only metadata. Read the full{' '}
            <Link href="/privacy">privacy policy</Link>.
          </p>
          <p>
            Want to test the extension before setting any of this up?{' '}
            <Link href="/demo">Walk through the interactive demo →</Link>
          </p>
        </section>

        <Footer />
      </article>
    </>
  );
}
