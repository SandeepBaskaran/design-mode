import assert from "node:assert/strict";
import { test } from "node:test";

import { buildExportCss, isValidTokenValue, sanitizeDraft } from "./tokens";

// Stand-in for CSS.supports, which Node lacks.
const supports = (property: string, value: string) =>
  property === "color"
    ? /^(#[0-9a-f]{3}([0-9a-f]{3})?|(rgb|hsl|oklch)\([^()]*\)|red|white|black|transparent)$/i.test(value)
    : property === "border-radius" && /^\d+(\.\d+)?(px|rem)$/.test(value);

test("accepts supported values for each token kind", () => {
  assert.equal(isValidTokenValue("--primary", "#abc", supports), true);
  assert.equal(isValidTokenValue("--primary", " oklch(0.7 0.1 90) ", supports), true);
  assert.equal(isValidTokenValue("--radius", "12px", supports), true);
  assert.equal(isValidTokenValue("--display-weight", "700", supports), true);
});

test("rejects malformed values and CSS breakouts", () => {
  assert.equal(isValidTokenValue("--primary", "", supports), false);
  assert.equal(isValidTokenValue("--primary", "notacolor", supports), false);
  assert.equal(isValidTokenValue("--primary", "red; } body { display: none", supports), false);
  assert.equal(isValidTokenValue("--radius", "big", supports), false);
  assert.equal(isValidTokenValue("--text-weight", "450", supports), false);
});

test("sanitizeDraft drops unknown tokens, non-strings and invalid values", () => {
  const editable = ["--primary", "--radius"];
  assert.deepEqual(sanitizeDraft(null, editable, supports), {});
  assert.deepEqual(sanitizeDraft(["#fff"], editable, supports), {});
  assert.deepEqual(
    sanitizeDraft({ "--primary": "#fff", "--radius": 4, "--evil": "red", "--radius2": "4px" }, editable, supports),
    { "--primary": "#fff" },
  );
  assert.deepEqual(sanitizeDraft({ "--primary": "red;}" }, editable, supports), {});
});

test("buildExportCss emits only the given changes as one :root block", () => {
  assert.equal(buildExportCss([]), "");
  assert.equal(
    buildExportCss([["--primary", " #123456 "], ["--radius", "4px"]]),
    ":root {\n  --primary: #123456;\n  --radius: 4px;\n}\n",
  );
});
