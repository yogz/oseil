'use client'

// What a screen tells the top menu: whether the update is on offer.
// The menu lives in the layout, above the screens; a screen outside the layout (a test) calls the
// hook without effect.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useIsDesktop } from '@/lib/app/use-desktop'
import { TopMenu, type TopMenuTab } from './TopMenu'

export type TopMenuInfo = { canUpdate: boolean }

const EMPTY: TopMenuInfo = { canUpdate: false }
const InfoContext = createContext<((info: TopMenuInfo) => void) | null>(null)

// Only a computer shows the menu: a phone's page keeps its own « Mettre à jour ». `canUpdate` null:
// nothing known yet (prices still loading), the menu keeps what it had, no flash off and on.
export function useTopMenuInfo({ canUpdate }: { canUpdate: boolean | null }) {
  const set = useContext(InfoContext)
  const desktop = useIsDesktop()
  useEffect(() => {
    if (!desktop) return
    if (canUpdate === null) return
    set?.({ canUpdate })
  }, [set, desktop, canUpdate])
}

// The menu itself, with what the screen under it has told it.
export function TopMenuProvider({
  show,
  settings = false,
  current,
  family,
  children,
}: {
  show: boolean
  // The Réglages are open: their link is marked like the current tab (A7).
  settings?: boolean
  current?: TopMenuTab
  // Screens of one family (Mon argent and its categories) share what the menu shows; another family starts clean.
  family: string
  children: ReactNode
}) {
  const [info, setInfo] = useState<TopMenuInfo>(EMPTY)
  const [seen, setSeen] = useState(family)
  if (seen !== family) {
    setSeen(family)
    setInfo(EMPTY)
  }
  const set = useMemo(() => setInfo, [])
  return (
    <InfoContext.Provider value={set}>
      {show ? <TopMenu current={current} settings={settings} canUpdate={info.canUpdate} /> : null}
      {children}
    </InfoContext.Provider>
  )
}
