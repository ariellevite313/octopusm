import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Next.js pages export `revalidate`, `metadata`, etc alongside components
      "react-refresh/only-export-components": "off",
      // Supabase client requires `as any` — disabled globally, inline comments removed
      "@typescript-eslint/no-explicit-any": "off",
      // Unused vars: warn only, ignore underscore-prefixed
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      // Empty catch blocks used in cookie helpers and RPC calls
      "no-empty": ["error", { "allowEmptyCatch": true }],
      // <img> elements: warn only (many legacy components use them with dynamic URLs)
      "@next/next/no-img-element": "warn",
      // Unused eslint-disable directives: off (we just cleaned them, avoid noise)
      "no-unused-disable-directives": "off",
    },
  },
];

export default eslintConfig;
