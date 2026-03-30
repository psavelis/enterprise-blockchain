import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "ci-results/**",
      "contracts/**",
      "dist/**",
      "node_modules/**",
      "eslint.config.js",
      "commitlint.config.js",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
  },
  // node:test registers tests as fire-and-forget top-level calls; awaiting
  // each test() return is not idiomatic and not required by the runner.
  {
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
    },
  },
  // Integration sketches and demo scripts instantiate SDK objects whose
  // constructors are typed through optional peer dependencies.  The unsafe-*
  // rules add no safety value here and would require SDK-specific casts.
  {
    files: [
      "examples/**/*-integration-sketch/**/*.ts",
      "scripts/integration-clients-demo.ts",
    ],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
    },
  },
  eslintConfigPrettier,
);
