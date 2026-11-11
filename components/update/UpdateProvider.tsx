'use client'

// Holds the monthly update for its screens: the state of the update and the
// establishment on screen. The update starts at the first establishment with no
// progress; `show` moves it. Where the update is unavailable, it sends the
// person back to Mon argent and renders nothing.

import { useRouter } from 'next/navigation'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Establishment } from '@/lib/model/types'
import { steps } from '@/lib/setup/first-launch'
import { useUpdate, type UpdateState } from '@/lib/update/use-update'

type Screen = { state: UpdateState; current: Establishment | null; show: (establishmentId: string) => void }

const UpdateContext = createContext<Screen | null>(null)

export function useUpdateScreen(): Screen {
  const screen = useContext(UpdateContext)
  if (!screen) throw new Error('useUpdateScreen must be used inside UpdateProvider')
  return screen
}

export function UpdateProvider({ children }: { children: ReactNode }) {
  const state = useUpdate()
  const router = useRouter()
  const [chosen, setChosen] = useState<string | null>(null)

  // Fixed once, when the update is first ready: later progress does not move the screen.
  if (state.status === 'ready' && chosen === null) {
    const { profile, draft } = state.session
    const all = steps(profile)
    const first = all.find((e) => draft.progress[e.id] === undefined) ?? all[0]
    if (first) setChosen(first.id)
  }

  useEffect(() => {
    if (state.status === 'unavailable') router.replace('/')
  }, [state.status, router])

  const profile = state.status === 'ready' ? state.session.profile : null
  const current = useMemo(
    () => (profile && chosen !== null ? (steps(profile).find((e) => e.id === chosen) ?? null) : null),
    [profile, chosen],
  )
  const value = useMemo<Screen>(() => ({ state, current, show: setChosen }), [state, current])

  if (state.status === 'unavailable') return null
  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>
}
