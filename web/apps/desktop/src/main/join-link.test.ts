import { describe, expect, it, vi } from "vitest"
import { createJoinInbox, findJoinLink, parseJoinLink } from "./join-link"

describe("parseJoinLink accepts", () => {
  it.each([
    ["tailshare://join/7K3Q-9PXM", "7K3Q9PXM"],
    ["tailshare://join/7K3Q9PXM", "7K3Q9PXM"],
    ["tailshare://join/7k3q-9pxm", "7K3Q9PXM"],
    ["tailshare://join/7k3q9pxm", "7K3Q9PXM"],
    // O reads as 0, I and L as 1, like the code box.
    ["tailshare://join/OILO-OILO", "01100110"],
    ["tailshare://join/oilooilo", "01100110"],
  ])("%s", (link, code) => {
    expect(parseJoinLink(link)).toBe(code)
  })
})

describe("parseJoinLink rejects", () => {
  it.each([
    ["wrong letter U", "tailshare://join/7K3Q-9PXU"],
    ["too short", "tailshare://join/7K3Q-9PX"],
    ["too long", "tailshare://join/7K3Q-9PXMM"],
    ["dash in the wrong place", "tailshare://join/7K3-Q9PXM"],
    ["two dashes", "tailshare://join/7K3Q--9PXM"],
    ["dash at the end", "tailshare://join/7K3Q9PX-M-"],
    ["a space", "tailshare://join/7K3Q 9PXM"],
    ["a trailing space", "tailshare://join/7K3Q9PXM "],
    ["a newline", "tailshare://join/7K3Q9PXM\n"],
    ["empty", ""],
    ["not a link", "7K3Q-9PXM"],
    ["malformed", "tailshare:/join/7K3Q9PXM"],
    ["wrong scheme", "https://join/7K3Q9PXM"],
    ["upper case scheme", "TAILSHARE://join/7K3Q9PXM"],
    ["other host", "tailshare://other/7K3Q9PXM"],
    ["host with a tail", "tailshare://join.evil/7K3Q9PXM"],
    ["credentials", "tailshare://user:pw@join/7K3Q9PXM"],
    ["a port", "tailshare://join:80/7K3Q9PXM"],
    ["a query", "tailshare://join/7K3Q9PXM?x=1"],
    ["an empty query", "tailshare://join/7K3Q9PXM?"],
    ["a fragment", "tailshare://join/7K3Q9PXM#x"],
    ["an empty fragment", "tailshare://join/7K3Q9PXM#"],
    ["an extra segment", "tailshare://join/7K3Q9PXM/extra"],
    ["a nested path", "tailshare://join/x/7K3Q9PXM"],
    ["a trailing slash", "tailshare://join/7K3Q9PXM/"],
    ["no code", "tailshare://join/"],
    ["a percent escape", "tailshare://join/7K3Q%39PXM"],
    ["a backslash", "tailshare://join\\7K3Q9PXM"],
  ])("%s", (_name, link) => {
    expect(parseJoinLink(link)).toBeNull()
  })
})

describe("findJoinLink", () => {
  it("picks the link out of other arguments", () => {
    expect(
      findJoinLink(["app.exe", "--hidden", "tailshare://join/7K3Q9PXM"])
    ).toBe("7K3Q9PXM")
  })

  it("ignores arguments that are not good links", () => {
    expect(findJoinLink(["app.exe", "tailshare://join/bad", "--x"])).toBeNull()
  })
})

describe("createJoinInbox", () => {
  it("holds links until ready, oldest first, then delivers at once", () => {
    const deliver = vi.fn()
    const inbox = createJoinInbox(deliver)

    inbox.push("AAAAAAAA")
    inbox.push("BBBBBBBB")
    expect(deliver).not.toHaveBeenCalled()

    inbox.ready()
    expect(deliver.mock.calls).toEqual([["AAAAAAAA"], ["BBBBBBBB"]])

    inbox.push("CCCCCCCC")
    expect(deliver).toHaveBeenLastCalledWith("CCCCCCCC")
  })

  it("drops a repeated code while it waits", () => {
    const deliver = vi.fn()
    const inbox = createJoinInbox(deliver)

    inbox.push("AAAAAAAA")
    inbox.push("AAAAAAAA")
    inbox.ready()

    expect(deliver).toHaveBeenCalledOnce()
  })

  it("keeps the newest 10 when too many wait", () => {
    const deliver = vi.fn()
    const inbox = createJoinInbox(deliver)

    for (let i = 0; i < 12; i++)
      inbox.push(`0000000${i.toString(32)}`.slice(-8))
    inbox.ready()

    expect(deliver).toHaveBeenCalledTimes(10)
    expect(deliver.mock.calls[0]).toEqual(["00000002"])
  })

  it("sends a code only once, and holds again after a reset", () => {
    const deliver = vi.fn()
    const inbox = createJoinInbox(deliver)

    inbox.push("AAAAAAAA")
    inbox.ready()
    inbox.ready()
    expect(deliver).toHaveBeenCalledOnce()

    inbox.reset()
    inbox.push("BBBBBBBB")
    expect(deliver).toHaveBeenCalledOnce()
    inbox.ready()
    expect(deliver).toHaveBeenLastCalledWith("BBBBBBBB")
  })
})
