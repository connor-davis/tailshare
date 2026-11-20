/**
 * jsdom has no layout, so Radix and the resizable panels need these stand-ins.
 * Node-only tests have no `window`, so they skip all of it.
 */
if (typeof window !== "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  window.ResizeObserver ??= ResizeObserverStub

  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }) as MediaQueryList

  Element.prototype.scrollTo ??= () => {}
  // The router restores scroll on every navigation; jsdom only logs a note.
  window.scrollTo = () => {}

  // Radix Select and friends call these on pointer events.
  Element.prototype.scrollIntoView ??= () => {}
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
}
