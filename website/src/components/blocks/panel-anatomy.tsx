import Image from "next/image";

import { DashedLine } from "../dashed-line";

import { cn } from "@/lib/utils";

type Item = {
  title: string;
  description: string;
  image: {
    src: string;
    alt: string;
    width: number;
    height: number;
  };
  className?: string;
  fade?: string[];
};

const topItems: Item[] = [
  {
    title: "Top bar — everything around the editor.",
    description:
      "A header row of overlay icons and an action toolbar that sits just above the three editing panels.",
    image: {
      src: "/panel-anatomy/top-row.png",
      alt: "Top bar of the side panel",
      width: 1485,
      height: 558,
    },
    className: "flex-1 [&>.title-container]:mb-5 md:[&>.title-container]:mb-8",
    fade: [""],
  },
  {
    title: "Bottom buttons — ship your edits.",
    description:
      "Two buttons collapse every change in the session into a shippable diff. Copy as Prompt goes to the clipboard; Send to Agent goes over MCP to a connected coding agent.",
    image: {
      src: "/panel-anatomy/bottom-row.png",
      alt: "Bottom buttons of the side panel",
      width: 1485,
      height: 558,
    },
    className: "flex-1 [&>.title-container]:mb-5 md:[&>.title-container]:mb-8",
    fade: [""],
  },
];

const bottomItems: Item[] = [
  {
    title: "Layers tab.",
    description:
      "See and reorganise the DOM tree of the page you're editing — without leaving the side panel.",
    image: {
      src: "/panel-anatomy/layers-tab.png",
      alt: "Layers tab",
      width: 981,
      height: 840,
    },
    className: "[&>.title-container]:mb-5 md:[&>.title-container]:mb-8",
    fade: ["bottom"],
  },
  {
    title: "Design tab.",
    description:
      "Nine Figma-aligned sections. Real controls — sliders, colour pickers, segmented buttons — not a textarea of CSS. Motion leads with trigger-first interaction cards; design-system tokens surface as swap-and-edit badges.",
    image: {
      src: "/panel-anatomy/design-tab.png",
      alt: "Design tab",
      width: 981,
      height: 840,
    },
    className: "[&>.title-container]:mb-5 md:[&>.title-container]:mb-8",
    fade: ["bottom"],
  },
  {
    title: "Changes tab.",
    description:
      "A full audit trail of every style, text, and DOM edit. Undo any one of them, or export the whole diff.",
    image: {
      src: "/panel-anatomy/changes-tab.png",
      alt: "Changes tab",
      width: 981,
      height: 840,
    },
    className: "[&>.title-container]:mb-5 md:[&>.title-container]:mb-8",
    fade: ["bottom"],
  },
];

export const PanelAnatomy = () => {
  return (
    <section
      id="panel-anatomy"
      className="overflow-hidden pb-28 lg:pb-32"
    >
      <div>
        <h2 className="container text-center text-3xl tracking-tight text-balance sm:text-4xl md:text-5xl lg:text-6xl">
          Every design control, in one side panel
        </h2>

        <div className="mt-8 md:mt-12 lg:mt-20">
          <DashedLine
            orientation="horizontal"
            className="container scale-x-105"
          />

          {/* Top row - 2 cards */}
          <div className="relative container flex max-md:flex-col">
            {topItems.map((item, i) => (
              <ItemCard key={i} item={item} isLast={i === topItems.length - 1} />
            ))}
          </div>
          <DashedLine
            orientation="horizontal"
            className="container max-w-7xl scale-x-110"
          />

          {/* Bottom row - 3 cards */}
          <div className="relative container grid max-w-7xl md:grid-cols-3">
            {bottomItems.map((item, i) => (
              <ItemCard
                key={i}
                item={item}
                isLast={i === bottomItems.length - 1}
                className="md:pb-0"
              />
            ))}
          </div>
        </div>
        <DashedLine
          orientation="horizontal"
          className="container max-w-7xl scale-x-110"
        />
      </div>
    </section>
  );
};

interface ItemCardProps {
  item: Item;
  isLast?: boolean;
  className?: string;
}

const ItemCard = ({ item, isLast, className }: ItemCardProps) => {
  return (
    <div
      className={cn(
        "relative flex flex-col justify-between px-0 py-6 md:px-6 md:py-8",
        className,
        item.className,
      )}
    >
      <div className="title-container text-balance">
        <h3 className="inline font-semibold">{item.title} </h3>
        <span className="text-muted-foreground"> {item.description}</span>
      </div>

      {item.fade?.includes("bottom") && (
        <div className="from-muted/80 absolute inset-0 z-10 bg-linear-to-t via-transparent to-transparent md:hidden" />
      )}

      <div className="image-container border-border bg-card overflow-hidden rounded-2xl border shadow-sm">
        <Image
          src={item.image.src}
          alt={item.image.alt}
          width={item.image.width}
          height={item.image.height}
          className="h-auto w-full object-contain object-left-top"
        />
      </div>

      {!isLast && (
        <>
          <DashedLine
            orientation="vertical"
            className="absolute top-0 right-0 max-md:hidden"
          />
          <DashedLine
            orientation="horizontal"
            className="absolute inset-x-0 bottom-0 md:hidden"
          />
        </>
      )}
    </div>
  );
};
