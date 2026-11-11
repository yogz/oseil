import Link from 'next/link'
import { Brand } from './Brand'
import { TABS, type TabId } from './TabBar'

export type TopMenuTab = TabId

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const ITEM = `inline-flex min-h-11 items-center text-body ${FOCUS}`

// The three tabs as a menu at the top, from lg (planche 20): « Mettre à jour » and « Réglages » on
// its right. Fixed like the tab bar it replaces; the layout leaves room. The date of the figures is
// no longer here (A2, Nicolas, 11 November 2026): at 1 280 px it pushed « Mon argent » and « Mettre à
// jour » onto two lines. Each screen says it under its own figures, as on a phone.
export function TopMenu({
  current,
  settings = false,
  canUpdate = false,
}: {
  current?: TopMenuTab
  // The Réglages are the page open: their link says so, as a tab does (A7).
  settings?: boolean
  canUpdate?: boolean
}) {
  return (
    <header className="fixed inset-x-0 top-0 z-10 hidden border-b border-hairline bg-ground lg:block">
      <div className="mx-auto flex max-w-5xl items-center gap-9 px-5 py-2">
        <Brand />
        <nav aria-label="Menu principal">
          <ul className="flex gap-6">
            {TABS.map((tab) => {
              const active = tab.id === current
              return (
                <li key={tab.id}>
                  <Link
                    href={tab.href}
                    aria-current={active ? 'page' : undefined}
                    className={
                      `${ITEM} border-b-2 pt-0.5 ` +
                      (active ? 'border-ink font-medium text-ink' : 'border-transparent text-ink-muted')
                    }
                  >
                    {tab.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
        {/* What the screen tells the menu fades in (A10): it never pops in under the eyes. */}
        <div className="ml-auto flex items-center gap-4 text-caption text-ink-muted">
          {canUpdate ? (
            <Link
              href="/mise-a-jour"
              className={`inline-flex min-h-11 animate-board-in items-center rounded-full border border-rule-strong px-4 text-body text-ink motion-reduce:animate-none ${FOCUS}`}
            >
              Mettre à jour
            </Link>
          ) : null}
          <Link
            href="/reglages"
            aria-current={settings ? 'page' : undefined}
            className={`${ITEM} border-b-2 pt-0.5 ${settings ? 'border-ink font-medium text-ink' : 'border-transparent text-ink-soft'}`}
          >
            Réglages
          </Link>
        </div>
      </div>
    </header>
  )
}
