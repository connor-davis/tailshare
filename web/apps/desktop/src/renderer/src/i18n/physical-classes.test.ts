import { expect, it } from "vitest"

/**
 * Physical direction utilities that are meant to stay physical. Every other
 * renderer component must use logical ones (ms/me, ps/pe, start/end,
 * text-start, border-s/e) so Arabic mirrors correctly.
 */
const allowed: Record<string, { tokens: string[]; why: string }> = {
  "components/drag-bar.tsx": {
    tokens: ["pr-"],
    why: "reserves room for the window caption buttons, which stay on the physical right",
  },
  "components/ui/sheet.tsx": {
    tokens: ["left-", "right-", "border-l", "border-r"],
    why: "the sheet's side prop names a physical screen edge",
  },
  "components/ui/resizable.tsx": {
    tokens: ["left-"],
    why: "centres the drag handle's hit area on the 1px divider",
  },
  "components/ui/dialog.tsx": {
    tokens: ["left-"],
    why: "centres the dialog with left-1/2 and -translate-x-1/2",
  },
  "components/ui/radio-group.tsx": {
    tokens: ["left-"],
    why: "centres the dot inside the radio",
  },
}

const physical =
  /(?<![\w-])-?(?:ml|mr|pl|pr|left|right)-|(?<![\w-])text-(?:left|right)\b|(?<![\w-])border-[lr]\b/g

/** Every renderer component's source text, keyed by path under src/. */
const sources = import.meta.glob(["../**/*.tsx", "!../**/*.test.tsx"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>

it("uses logical direction classes outside the allowlist", () => {
  const found: string[] = []

  for (const [path, source] of Object.entries(sources)) {
    const name = path.replace("../", "")
    const ok = allowed[name]?.tokens ?? []
    for (const match of source.matchAll(physical)) {
      const token = match[0].replace(/^-/, "")
      if (!ok.includes(token)) found.push(`${name}: ${match[0]}`)
    }
  }

  expect(Object.keys(sources).length).toBeGreaterThan(30)
  expect(found).toEqual([])
})
