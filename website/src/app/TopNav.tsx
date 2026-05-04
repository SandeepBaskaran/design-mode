import Link from "next/link";

const GITHUB_URL = "https://github.com/SandeepBaskaran/design-mode";

function AddToChromeButton() {
  return (
    <a
      href="/#install"
      className="add-to-chrome-btn"
      aria-label="Add Design Mode to Chrome"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/chrome.svg" alt="" width={18} height={18} aria-hidden="true" />
      <span>Add to Chrome</span>
    </a>
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
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
        <path d="M9 18c-4.51 2-5-2-7-2" />
      </svg>
    </a>
  );
}

export function TopNav() {
  return (
    <div className="page-title-row">
      <Link href="/" className="page-title">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.png" alt="" width={20} height={20} aria-hidden="true" />
        <span>Design Mode</span>
      </Link>
      <div className="title-actions">
        <GitHubIconButton />
        <AddToChromeButton />
      </div>
    </div>
  );
}
