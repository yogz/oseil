'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

// Planche 5 (Nicolas, 10 November 2026): what has just been added arrives in its list as a square
// arrives in the grid, fading in while it rises (`animate-square-arrive`), and only then: a list
// shown again, or a screen opened on what was already there, does not move.
//
// What a list has already shown is kept for the visit (one set per list, in memory, never stored):
// a list remembers what it held the first time it was drawn, and each item, when it first appears,
// asks whether it is new to its list. The forms of a step replace its list on screen, so the list
// cannot keep this itself: it would forget it each time a form opens.
const shownBy = new Map<string, Set<string>>()

const ListContext = createContext<string | null>(null)

export function ArrivalList({ list, ids, children }: { list: string; ids: string[]; children: ReactNode }) {
  // Before the items are drawn: what is there the first time is not new.
  useState(() => {
    if (!shownBy.has(list)) shownBy.set(list, new Set(ids))
  })
  return <ListContext.Provider value={list}>{children}</ListContext.Provider>
}

// The classes of an item that has just arrived, or nothing.
export function useArrival(id: string): string {
  const list = useContext(ListContext)
  const [fresh] = useState(() => {
    const shown = list === null ? undefined : shownBy.get(list)
    if (!shown || shown.has(id)) return false
    shown.add(id)
    return true
  })
  return fresh ? 'animate-square-arrive motion-reduce:animate-none' : ''
}

// For a list item that is a plain element: the same, as a wrapper.
export function Arriving({ id, as: Tag = 'li', className, children }: { id: string; as?: 'li' | 'div'; className?: string; children: ReactNode }) {
  const arrival = useArrival(id)
  return <Tag className={[className, arrival].filter(Boolean).join(' ') || undefined}>{children}</Tag>
}
