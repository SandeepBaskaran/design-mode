import { DashedLine } from "@/components/dashed-line";

const stats = [
  { value: "MIT", label: "License" },
  { value: "0", label: "Telemetry by default" },
  { value: "$0", label: "Forever" },
  { value: "1", label: "Person, for now" },
];

export function AboutHero() {
  return (
    <section>
      <div className="container flex max-w-5xl flex-col justify-between gap-8 md:gap-20 lg:flex-row lg:items-center lg:gap-24 xl:gap-24">
        <div className="flex-[1.5]">
          <h1 className="text-3xl tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">
            One person's bet that design deserves a better surface
          </h1>

          <p className="text-muted-foreground mt-5 text-2xl md:text-3xl lg:text-4xl">
            Vibe-coding shouldn't mean asking the model to imagine your CSS.
          </p>

          <p className="text-muted-foreground mt-8 hidden max-w-lg space-y-6 text-lg text-balance md:block lg:mt-12">
            Design Mode is a free, open-source Chrome extension that turns
            any website into a live design surface. Inspect, edit, and ship
            the diff straight to a coding agent over MCP — no mock files, no
            screenshot pasting, no asking the model to guess what you meant.
            <br />
            <br />
            It's built by one developer, in the open, under MIT. There are
            no accounts, no telemetry by default, no paywalls. The cloud
            relay is opt-in and self-hostable. If it's useful to you, the
            Contribute panel in the side panel has ways to help — but none
            of them are required.
          </p>
        </div>

        <div className="relative flex flex-1 flex-col justify-center gap-3 pt-10 lg:pt-0 lg:pl-10">
          <DashedLine
            orientation="vertical"
            className="absolute top-0 left-0 max-lg:hidden"
          />
          <DashedLine
            orientation="horizontal"
            className="absolute top-0 lg:hidden"
          />
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col gap-1">
              <div className="font-display text-4xl tracking-wide md:text-5xl">
                {stat.value}
              </div>
              <div className="text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
