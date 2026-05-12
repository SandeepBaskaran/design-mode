"use client";

import Link from "next/link";

const GITHUB_URL = "https://github.com/SandeepBaskaran/design-mode";
const CHROME_STORE_URL =
  "https://chromewebstore.google.com/detail/design-mode/ighgobegfcmjagombgnfhgioflinojih";

// GA event helper. Safely no-ops when gtag isn't loaded (e.g. local builds
// without NEXT_PUBLIC_GA_ID set, or forks that haven't wired analytics).
type GtagFn = (command: "event", action: string, params: Record<string, unknown>) => void;
function track(action: string, params: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const w = window as unknown as { gtag?: GtagFn };
  w.gtag?.("event", action, params);
}

function AddToChromeButton() {
  return (
    <a
      href={CHROME_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="add-to-chrome-btn"
      aria-label="Add Design Mode to Chrome"
      onClick={() => track("cta_click", { cta: "add_to_chrome", location: "top_nav" })}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/chrome.svg" alt="" width={18} height={18} aria-hidden="true" />
      <span>Add to Chrome</span>
    </a>
  );
}

function TryDemoButton() {
  return (
    <Link
      href="/demo"
      className="secondary-btn"
      onClick={() => track("cta_click", { cta: "try_demo", location: "top_nav" })}
    >
      <span>Try the Demo</span>
    </Link>
  );
}

// "MCP" nav button — appears on home + demo so users can jump straight
// to the connection-setup tour from anywhere in the marketing surface.
// The /mcp page itself renders the home variant of TopNav, so the
// button is implicitly skipped there (we don't want a self-link).
function McpButton() {
  return (
    <Link
      href="/mcp"
      className="secondary-btn"
      onClick={() => track("cta_click", { cta: "mcp", location: "top_nav" })}
    >
      <span>MCP</span>
    </Link>
  );
}

// Back-home button used in the demo nav in place of the wordmark on /demo,
// where pushing users back to the marketing page is more useful than a
// home link they already came from.
function BackHomeButton() {
  return (
    <Link
      href="/"
      className="secondary-btn"
      onClick={() => track("cta_click", { cta: "back_home", location: "demo_nav" })}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </svg>
      <span>Back home</span>
    </Link>
  );
}

function GitHubIconButton() {
  return (
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="icon-btn"
      aria-label="View on GitHub"
      title="View on GitHub"
      onClick={() => track("cta_click", { cta: "github", location: "top_nav" })}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
        <path d="M9 18c-4.51 2-5-2-7-2" />
      </svg>
    </a>
  );
}

// `variant` swaps the left-side widget and the secondary CTA:
//   - "home" (default): wordmark on the left, "Try the Demo" + "MCP" in the actions.
//   - "demo": "Back home" button replaces the wordmark; the Try-Demo CTA
//     is dropped because the user is already on the demo page. MCP stays.
//   - "mcp": "Back home" left + Try Demo right; MCP button skipped (self-link).
export function TopNav({ variant = "home" }: { variant?: "home" | "demo" | "mcp" } = {}) {
  const isDemo = variant === "demo";
  const isMcp = variant === "mcp";
  return (
    <div className="page-title-row">
      {(isDemo || isMcp) ? (
        <BackHomeButton />
      ) : (
        <Link href="/" className="page-title">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="" width={20} height={20} aria-hidden="true" />
          <span>Design Mode</span>
        </Link>
      )}
      <div className="title-actions">
        <GitHubIconButton />
        {!isDemo && !isMcp && <TryDemoButton />}
        {isMcp && <TryDemoButton />}
        {!isMcp && <McpButton />}
        <AddToChromeButton />
      </div>
    </div>
  );
}
