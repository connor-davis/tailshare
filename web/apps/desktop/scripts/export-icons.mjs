import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import pngToIco from "png-to-ico"

const build = new URL("../build/", import.meta.url)
const source = await readFile(new URL("logo.svg", build))
const sizes = [16, 24, 32, 48, 64, 128, 256]

async function raster(size) {
  const png = await sharp(source).resize(size, size).png().toBuffer()
  const metadata = await sharp(png).metadata()
  assert.equal(metadata.width, size)
  assert.equal(metadata.height, size)
  return png
}

const ico = await pngToIco(await Promise.all(sizes.map(raster)))
assert.equal(ico.readUInt16LE(2), 1)
assert.equal(ico.readUInt16LE(4), sizes.length)
for (const [index, size] of sizes.entries()) {
  const offset = 6 + index * 16
  assert.equal(ico[offset] || 256, size)
  assert.equal(ico[offset + 1] || 256, size)
}
await writeFile(new URL("icon.ico", build), ico)
for (const [name, size] of [
  ["icon.png", 512],
  ["tray-16.png", 16],
  ["tray-32.png", 32],
]) {
  await writeFile(new URL(name, build), await raster(size))
}
console.log(
  `Exported and verified ICO ${sizes.join("/")} and PNG 512/16/32 in ${fileURLToPath(build)}`
)
