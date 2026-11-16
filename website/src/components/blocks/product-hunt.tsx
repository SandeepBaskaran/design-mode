// Official Product Hunt featured badge for post 1146657.
// The SVG is the upvote badge: the caret and the vote count sit on the right.
// Listing URL is the one already used in git history. theme=light is the only
// theme that history shipped; this site does not add a dark class.
const LISTING =
  "https://www.producthunt.com/products/design-mode?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-design-mode-2";
const BADGE =
  "https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1146657&theme=light";

export function ProductHunt() {
  return (
    <a
      href={LISTING}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex shrink-0"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BADGE}
        alt="Design Mode on Product Hunt, with its upvote count"
        width={250}
        height={54}
        className="block h-[54px] w-[250px] max-w-none"
      />
    </a>
  );
}
