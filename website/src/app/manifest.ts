import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Design Mode",
    short_name: "Design Mode",
    description:
      "A free, open-source Chrome extension that turns any website into a live design surface, then ships the diff to Claude Code, Cursor, and any MCP-compatible AI coding agent.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/favicon.ico", sizes: "any", type: "image/x-icon" },
      { src: "/og-image.png", sizes: "1200x630", type: "image/png" },
    ],
  };
}
