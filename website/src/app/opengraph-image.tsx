import { ImageResponse } from "next/og";

export const alt = "Design Mode — Live design editing for developers and agents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0a0a0a",
          color: "#fafafa",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            color: "#a1a1aa",
            fontSize: 28,
            letterSpacing: -0.5,
            marginBottom: 28,
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 4,
              background:
                "linear-gradient(135deg, #c084fc 0%, #6366f1 100%)",
            }}
          />
          designmode.app
        </div>
        <div
          style={{
            fontSize: 96,
            fontWeight: 700,
            lineHeight: 1.02,
            letterSpacing: -2,
            maxWidth: 1000,
          }}
        >
          Design directly in your browser.
        </div>
        <div
          style={{
            fontSize: 96,
            fontWeight: 700,
            lineHeight: 1.02,
            letterSpacing: -2,
            color: "#a1a1aa",
            maxWidth: 1000,
            marginTop: 6,
          }}
        >
          Your agent writes the code.
        </div>
        <div
          style={{
            fontSize: 28,
            color: "#a1a1aa",
            marginTop: 40,
            maxWidth: 900,
          }}
        >
          Free, open-source Chrome extension. Edits ship to Claude, Cursor,
          and any MCP-aware agent.
        </div>
      </div>
    ),
    size,
  );
}
