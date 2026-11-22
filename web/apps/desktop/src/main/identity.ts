import { randomBytes, randomUUID } from "node:crypto"
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"

/** How the sidecar reads a node private key: `privkey:` and 64 hex characters. */
const PRIVATE_KEY = /^privkey:[0-9a-f]{64}$/

/** A fresh Curve25519 key, clamped the way Go's `key.NewNode` clamps it. */
function newPrivateKey(): string {
  const raw = randomBytes(32)
  raw[0]! &= 248
  raw[31]! &= 127
  raw[31]! |= 64

  return `privkey:${raw.toString("hex")}`
}

/**
 * This computer's secret join key. It lets a host recognise the same computer
 * in a later room, which is what makes "Trust this computer" work. It lives in
 * its own file (`identity.key` under `directory`), never in the settings, and
 * goes only to the sidecar. Deleting the file makes a new key next start.
 */
export function loadIdentity(directory: string): string {
  const file = join(directory, "identity.key")

  try {
    const saved = readFileSync(file, "utf8").trim()
    if (PRIVATE_KEY.test(saved)) return saved

    // Keep a bad file instead of deleting it, and start a new key.
    renameSync(file, `${file}.bak`)
  } catch {
    // Nothing saved yet, or it could not be moved: make a key below.
  }

  const created = newPrivateKey()
  const temporary = `${file}.${randomUUID()}.tmp`

  try {
    mkdirSync(directory, { recursive: true })
    writeFileSync(temporary, `${created}\n`, { flag: "wx", mode: 0o600 })
    renameSync(temporary, file)
  } catch {
    // ponytail: an unsaved key still works for this run, but hosts will not
    // recognise this computer next time. Retrying on every start is the way up.
  } finally {
    rmSync(temporary, { force: true })
  }

  return created
}
