import Link from 'next/link'

export type TabId = 'mon-argent' | 'reperes' | 'evolution'

export const TABS: ReadonlyArray<{ id: TabId; label: string; href: string }> = [
  { id: 'mon-argent', label: 'Mon argent', href: '/' },
  { id: 'reperes', label: 'Repères', href: '/reperes' },
  { id: 'evolution', label: 'Évolution', href: '/evolution' },
]

const TAB = 'flex min-h-12 items-center justify-center -mt-px border-t-2 pt-1 text-caption'

// `current` is left out on a screen that belongs to no tab (the settings).
export function TabBar({ current }: { current?: TabId }) {
  return (
    <nav aria-label="Onglets" className="fixed inset-x-0 bottom-0 border-t border-hairline bg-ground lg:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-3 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {TABS.map((tab) => {
          const active = tab.id === current
          return (
            <li key={tab.id}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={
                  `${TAB} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ` +
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
  )
}
