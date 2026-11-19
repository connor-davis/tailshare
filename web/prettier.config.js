/** Shared formatting follows Viper, with the desktop token stylesheet. */
export default {
  endOfLine: "lf",
  semi: false,
  singleQuote: false,
  tabWidth: 2,
  trailingComma: "es5",
  printWidth: 80,
  plugins: ["prettier-plugin-tailwindcss"],
  tailwindStylesheet: "./apps/desktop/src/renderer/src/styles/globals.css",
  tailwindFunctions: ["cn", "cva"],
}
