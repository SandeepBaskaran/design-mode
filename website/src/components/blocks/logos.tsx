import Image from "next/image";
import Link from "next/link";

import Marquee from "react-fast-marquee";

import { cn } from "@/lib/utils";

type Company = {
  name: string;
  logo: string;
  width: number;
  height: number;
  href: string;
};

export const Logos = () => {
  const topRowCompanies: Company[] = [
    {
      name: "Claude",
      logo: "/logos/claude.svg",
      width: 120,
      height: 30,
      href: "https://www.anthropic.com/claude",
    },
    {
      name: "OpenAI",
      logo: "/logos/openai.svg",
      width: 100,
      height: 26,
      href: "https://openai.com",
    },
    {
      name: "Perplexity",
      logo: "/logos/perplexity.svg",
      width: 141,
      height: 32,
      href: "https://perplexity.ai",
    },
    {
      name: "Notion",
      logo: "/logos/notion.svg",
      width: 110,
      height: 24,
      href: "https://notion.so",
    },
  ];

  const bottomRowCompanies: Company[] = [
    {
      name: "Raycast",
      logo: "/logos/raycast.svg",
      width: 128,
      height: 33,
      href: "https://raycast.com",
    },
    {
      name: "Arc",
      logo: "/logos/arc.svg",
      width: 90,
      height: 28,
      href: "https://arc.net",
    },
    {
      name: "Retool",
      logo: "/logos/retool.svg",
      width: 113,
      height: 22,
      href: "https://retool.com",
    },
    {
      name: "Descript",
      logo: "/logos/descript.svg",
      width: 112,
      height: 27,
      href: "https://descript.com",
    },
  ];

  return (
    <section className="overflow-hidden pb-28 lg:pb-32">
      <div className="container space-y-10 lg:space-y-16">
        <div className="text-center">
          <h2 className="mb-4 text-xl text-balance md:text-2xl lg:text-3xl">
            Talks to every AI tool that speaks MCP.
            <br className="max-md:hidden" />
            <span className="text-muted-foreground">
              Drop your edits straight into Claude, Cursor, or any agent that
              supports the protocol.
            </span>
          </h2>
        </div>

        <div className="flex w-full flex-col items-center gap-8">
          <LogoRow companies={topRowCompanies} gridClassName="grid-cols-4" />
          <LogoRow
            companies={bottomRowCompanies}
            gridClassName="grid-cols-4"
            direction="right"
          />
        </div>
      </div>
    </section>
  );
};

type LogoRowProps = {
  companies: Company[];
  gridClassName: string;
  direction?: "left" | "right";
};

const LogoRow = ({ companies, gridClassName, direction }: LogoRowProps) => {
  return (
    <>
      {/* Desktop static version */}
      <div className="hidden md:block">
        <div
          className={cn(
            "grid items-center justify-items-center gap-x-20 lg:gap-x-28",
            gridClassName,
          )}
        >
          {companies.map((company, index) => (
            <Link href={company.href} target="_blank" key={index}>
              <Image
                src={company.logo}
                alt={`${company.name} logo`}
                width={company.width}
                height={company.height}
                className="dark:opacity/100 object-contain opacity-50 transition-opacity hover:opacity-70 dark:invert"
              />
            </Link>
          ))}
        </div>
      </div>

      {/* Mobile marquee version */}
      <div className="md:hidden">
        <Marquee direction={direction} pauseOnHover>
          {companies.map((company, index) => (
            <Link
              href={company.href}
              target="_blank"
              key={index}
              className="mx-8 inline-block transition-opacity hover:opacity-70"
            >
              <Image
                src={company.logo}
                alt={`${company.name} logo`}
                width={company.width}
                height={company.height}
                className="object-contain"
              />
            </Link>
          ))}
        </Marquee>
      </div>
    </>
  );
};
