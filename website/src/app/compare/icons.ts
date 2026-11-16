export type CompetitorIcon = {
  src: string;
  source: string | null;
};

const placeholder = "/compare-icons/placeholder.svg";

export const competitorIcons: Record<string, CompetitorIcon> = {
  "design-mode-vs-magicpath": {
    src: "/compare-icons/magicpath.ico",
    source: "https://www.magicpath.ai/favicon.ico",
  },
  "design-mode-vs-backdraft": {
    src: "/compare-icons/backdraft.png",
    source: "https://backdraftai.com/images/favicon-32.png",
  },
  "design-mode-vs-uiprompt": {
    src: "/compare-icons/uiprompt.svg",
    source: "https://uiprompt.co/icon.svg",
  },
  "design-mode-vs-handle-extension": {
    src: "/compare-icons/handle.png",
    source: "https://gethandle.ai/handle-favicon-color-light-192@1x.png",
  },
  "design-mode-vs-css-studio": {
    src: "/compare-icons/css-studio.png",
    source: "https://images.motion.dev/cssstudio/favicon.png",
  },
  "design-mode-vs-stagewise": {
    src: "/compare-icons/stagewise.png",
    source: "https://stagewise.io/icon.png",
  },
  "design-mode-vs-pls-fix": {
    src: "/compare-icons/plsfix.svg",
    source: "https://www.plsfix.app/icon.svg",
  },
  "design-mode-vs-drawbridge": {
    src: "/compare-icons/drawbridge.svg",
    source: "https://www.drawbridge.ai/icon.svg",
  },
  "design-mode-vs-agentation": {
    src: "/compare-icons/agentation.png",
    source: "https://agentation.com/icon.png",
  },
  "design-mode-vs-dialkit": {
    src: "/compare-icons/dialkit.svg",
    source: "https://dialkit.dev/icon.svg",
  },
  "design-mode-vs-cursor-design-mode": {
    src: "/compare-icons/cursor.png",
    source: "https://cursor.com/marketing-static/icon-192x192-light.png",
  },
  "design-mode-vs-csspeeper": {
    src: "/compare-icons/csspeeper.png",
    source: "https://csspeeper.com/icon.png",
  },
  "design-mode-vs-builder-io-visual-copilot": {
    src: "/compare-icons/builder.ico",
    source: "https://www.builder.io/favicon.ico",
  },
  "design-mode-vs-locofy": {
    src: "/compare-icons/locofy.png",
    source: "https://www.locofy.ai/assets/icons/apple-touch-icon.png",
  },
  "design-mode-vs-chrome-devtools": {
    src: "/compare-icons/chrome.png",
    source:
      "https://www.gstatic.com/devrel-devsite/prod/v579d635a54d6e1f40caad46ce407560c5106c8915e5ff7e6341f5b13eb245c5a/chrome/images/favicon.png",
  },
  "design-mode-vs-figma-dev-mode": {
    src: "/compare-icons/figma.png",
    source: "https://static.figma.com/app/icon/2/favicon.png",
  },
  "design-mode-vs-figma-make": {
    src: "/compare-icons/figma.png",
    source: "https://static.figma.com/app/icon/2/favicon.png",
  },
  "design-mode-vs-editui": {
    src: "/compare-icons/editui.png",
    source: "https://www.editui.app/icon.png",
  },
  "design-mode-vs-airship": {
    src: "/compare-icons/airship.svg",
    source: "https://www.airship.design/favicon.svg",
  },
  "design-mode-vs-layerdock": {
    src: "/compare-icons/layerdock.png",
    source: "https://www.layerdock.io/logo/icon/png/color/icon-color-32.png",
  },
  "design-mode-vs-ui-ticket-mcp": { src: placeholder, source: null },
  "design-mode-vs-ui-inspector": { src: placeholder, source: null },
  "design-mode-vs-hover-inspector": { src: placeholder, source: null },
  "design-mode-vs-visbug": { src: placeholder, source: null },
  "design-mode-vs-vex": { src: placeholder, source: null },
};

export function iconFor(slug: string): CompetitorIcon {
  return competitorIcons[slug] ?? { src: placeholder, source: null };
}
