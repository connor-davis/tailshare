import { expect, it } from "vitest"
import { checkCatalog } from "./catalog-validation"
import { pseudoText } from "./pseudo-locale"

it("rejects extra keys, missing forms, and changed placeholders", () => {
  const source = {
    hello: "Hello {name}",
    files: { one: "{count} file", other: "{count} files" },
  }
  const broken = {
    hello: "Hola {nombre}",
    files: { other: "{count} archivos" },
    extra: "Extra",
  }
  expect(checkCatalog(source, broken, "es")).toEqual([
    "keys differ",
    "hello: parameters differ or text is empty",
    "files: plural forms differ",
  ])
})

it("pads visible text by 35% without changing named placeholders", () => {
  expect(pseudoText("Hello {name}")).toBe("[Hello {name}~~~]")
  expect(pseudoText("{count} files for {name}")).toContain(
    "{count} files for {name}"
  )
})
