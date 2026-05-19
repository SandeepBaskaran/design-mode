import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: {},
});

const eslintConfig = [
  {
    ignores: ["node_modules/**"],
  },
  ...compat.extends(
    "next/core-web-vitals",
    "next/typescript",
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/recommended",
    "plugin:import/typescript",
    "next",
    "plugin:jsx-a11y/recommended",
  ),
  {
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      "react/jsx-key": "off",
      "react/display-name": "off",
      "import/no-named-as-default-member": "off",
      "react/react-in-jsx-scope": "off",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-ignore": "allow-with-description" },
      ],
      "jsx-a11y/no-static-element-interactions": "off",
      "jsx-a11y/click-events-have-key-events": "off",
      "jsx-a11y/no-noninteractive-element-interactions": "off",
      "jsx-a11y/no-noninteractive-tabindex": "off",
      "jsx-a11y/media-has-caption": "off",
      "jsx-a11y/anchor-is-valid": "off",
      "jsx-a11y/heading-has-content": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "react/no-unescaped-entities": "off",
      "no-console": "warn",
      "import/order": [
        "error",
        {
          groups: [
            ["builtin", "external"],
            ["internal", "parent", "sibling", "index"],
          ],
          pathGroups: [
            {
              pattern: "react",
              group: "builtin",
              position: "before",
            },
            {
              pattern: "next/**",
              group: "builtin",
              position: "before",
            },
            {
              pattern: "@/**",
              group: "internal",
              position: "after",
            },
          ],
          pathGroupsExcludedImportTypes: ["builtin"],
          "newlines-between": "always",
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
        },
      ],
    },
  },
];

export default eslintConfig;
