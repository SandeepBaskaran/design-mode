export type CssSupports = (property: string, value: string) => boolean;

const WEIGHT_TOKENS = new Set(["--display-weight", "--text-weight"]);

export function isValidTokenValue(name: string, value: string, supports: CssSupports) {
  const v = value.trim();
  // Custom properties accept almost anything, so a value like `red; } body {` would survive
  // setProperty and land verbatim in the exported CSS. Check it against the property it feeds.
  if (!v || /[;{}]/.test(v)) return false;
  if (name === "--radius") return supports("border-radius", v);
  if (WEIGHT_TOKENS.has(name)) return /^[1-9]00$/.test(v);
  return supports("color", v);
}

export function sanitizeDraft(raw: unknown, editable: readonly string[], supports: CssSupports) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const allowed = new Set(editable);
  return Object.fromEntries(
    Object.entries(raw).filter(
      ([name, value]) => allowed.has(name) && typeof value === "string" && isValidTokenValue(name, value, supports),
    ),
  ) as Record<string, string>;
}

export function buildExportCss(changed: [string, string][]) {
  return changed.length ? `:root {\n${changed.map(([n, v]) => `  ${n}: ${v.trim()};`).join("\n")}\n}\n` : "";
}
