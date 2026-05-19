import Image from "next/image";

const investors = [
  {
    name: "Dennis Bouvard",
    company: "Blackbird Ventures",
    image: "/investors/1.webp",
  },
  {
    name: "Renatus Gerard",
    company: "Center Studies",
    image: "/investors/2.webp",
  },
  {
    name: "Leslie Alexander",
    company: "TechNexus",
    image: "/investors/3.webp",
  },
  {
    name: "Matthew Stephens",
    company: "Etymol Cap",
    image: "/investors/4.webp",
  },
  {
    name: "Josephine Newman",
    company: "Vandenberg",
    image: "/investors/5.webp",
  },
];

export function Investors() {
  return (
    <section className="container max-w-5xl py-12">
      <h2 className="text-foreground text-4xl font-medium tracking-wide">
        Our investors
      </h2>
      <div className="mt-8 grid grid-cols-2 gap-12 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {investors.map((investor) => (
          <div key={investor.name} className="">
            <Image
              src={investor.image}
              alt={investor.name}
              width={120}
              height={120}
              className="object-cover"
            />
            <h3 className="mt-3 font-semibold">{investor.name}</h3>
            <p className="text-muted-foreground">{investor.company}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
