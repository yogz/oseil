// A full page load, not a client-side move: nothing the current page held in
// memory — a data key above all — survives it. Kept in its own module so a
// test can see where a screen sends the person.
export function loadPage(path: string): void {
  window.location.replace(path)
}
