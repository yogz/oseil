'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { UpdateProvider } from '@/components/update/UpdateProvider'
import { ScreenTransition } from './ScreenTransition'
import type { TopMenuTab } from './TopMenu'
import { TopMenuProvider } from './top-menu-info'

// The update and the first launch take the whole screen, with no menu.
const FULL_SCREEN = ['/mise-a-jour', '/premier-lancement']

const within = (path: string, root: string) => path === root || path.startsWith(`${root}/`)

// B6: one page template on a computer. Every screen of the application is drawn on the same width,
// in the two columns of Mon argent (see PageColumns); only the full-screen flows keep their phone
// layout, centred and a little wider.

function tabOf(path: string): TopMenuTab | undefined {
  if (within(path, '/reperes')) return 'reperes'
  if (within(path, '/evolution')) return 'evolution'
  if (path === '/' || within(path, '/categorie') || within(path, '/ligne')) return 'mon-argent'
  return undefined
}

// The screens of the application proper: the menu at the top from lg (the tab bar, below), and the
// width of the page. On a phone nothing here changes the page.
export function AppFrame({ children }: { children: ReactNode }) {
  const path = usePathname() ?? '/'
  const menu = !FULL_SCREEN.some((root) => within(path, root))
  return (
    <TopMenuProvider
      show={menu}
      current={tabOf(path)}
      settings={within(path, '/reglages')}
      family={path === '/' || within(path, '/categorie') ? 'mon-argent' : path}
    >
      {/* Room at the bottom for the tab bar, which stays fixed there; at the top from lg for the menu. */}
      <main
        className={
          // 12 px at the top of a phone (24 before 9 November 2026): the first screen of Mon argent
          // gives its room to the grid, and every screen keeps its title at the same height.
          'mx-auto flex w-full max-w-md flex-1 flex-col px-5 pt-3 pb-28 lg:pb-10 ' +
          (menu ? 'lg:max-w-5xl' : 'lg:max-w-xl') +
          (menu ? ' lg:pt-24' : ' lg:pt-6')
        }
      >
        {/* The update's provider holds the bank on screen: above the fade, whose new key on each
            address builds everything below it again (11 November 2026: built again, it forgot the
            bank touched and opened the first one left). */}
        {within(path, '/mise-a-jour') ? (
          <UpdateProvider>
            <ScreenTransition>{children}</ScreenTransition>
          </UpdateProvider>
        ) : (
          <ScreenTransition>{children}</ScreenTransition>
        )}
      </main>
    </TopMenuProvider>
  )
}
