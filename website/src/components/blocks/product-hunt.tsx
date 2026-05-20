export function ProductHunt() {
  return (
    <section className="pb-12 lg:pb-16">
      <div className="container flex justify-center">
        <a
          href="https://www.producthunt.com/products/design-mode?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-design-mode-2"
          target="_blank"
          rel="noopener noreferrer"
        >
          {/* Plain <img> — Next/image would need api.producthunt.com in
              images.remotePatterns. Not worth the config for a 250x54
              badge that PH re-stamps with a tracking param anyway. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1146657&theme=light&t=1779274729933"
            alt="Design Mode — Featured on Product Hunt"
            width={250}
            height={54}
          />
        </a>
      </div>
    </section>
  );
}
