// The flows that take the whole screen, with no menu nor tab bar: the update, the first launch and
// « Trouver » (docs/superpowers/specs/2026-11-14-trouver-design.md). The one list: the frame of the
// application (components/ui/AppFrame.tsx) and the ⌘K shortcut (find-entry.ts) both read it.
export const FULL_SCREEN = ['/mise-a-jour', '/premier-lancement', '/trouver'] as const

export const within = (path: string, root: string) => path === root || path.startsWith(`${root}/`)

export const isFullScreen = (path: string) => FULL_SCREEN.some((root) => within(path, root))
