import js from "@eslint/js"
import tseslint from "typescript-eslint"
import reactHooks from "eslint-plugin-react-hooks"
import jsdoc from "eslint-plugin-jsdoc"
import { defineConfig, globalIgnores } from "eslint/config"

/** Check authored exports, including constants, routes and TypeScript types. */
export default defineConfig([
  globalIgnores([
    "**/out/**",
    "**/routeTree.gen.ts",
    "**/src/renderer/src/components/ui/**",
    "**/.turbo/**",
    "apps/mobile/android/**",
    "apps/mobile/ios/**",
    "apps/mobile/.expo/**",
  ]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    plugins: { jsdoc },
    settings: { jsdoc: { mode: "typescript" } },
    rules: {
      "jsdoc/require-jsdoc": [
        "error",
        {
          enableFixer: false,
          require: { FunctionDeclaration: false },
          contexts: [
            "ExportNamedDeclaration",
            "ExportDefaultDeclaration",
            "ExportAllDeclaration",
          ],
        },
      ],
      "jsdoc/require-description": "error",
    },
  },
])
