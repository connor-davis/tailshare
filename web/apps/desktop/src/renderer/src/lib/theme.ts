/**
 * Puts the `dark` class on `root` when the system prefers dark, and keeps it
 * in step as the system changes. Returns a function that stops following.
 * There is no saved override: light and dark come from Windows only.
 */
export function followColorScheme(
  query: MediaQueryList,
  root: HTMLElement
): () => void {
  const apply = () => root.classList.toggle("dark", query.matches)

  apply()
  query.addEventListener("change", apply)

  return () => query.removeEventListener("change", apply)
}
