'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'

// A sheet at the bottom of a phone (a card in the middle on a computer), over the screen it leaves
// dimmed: a title, a sentence, then its choices (`children`). The first choice takes the focus; Tab
// goes round the choices, never to the screen under it; Escape or a touch on the dimmed screen call
// `onClose`, and the focus goes back to what had it. Used by the example (ExampleSheet) and by the
// reminder of an update (UpdateReminder).
export function Sheet({
  open,
  onClose,
  title,
  text,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  text: string
  children: ReactNode
}) {
  const titleId = useId()
  const textId = useId()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.querySelector<HTMLElement>('a, button')?.focus()
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panel.current) return
      const choices = [...panel.current.querySelectorAll<HTMLElement>('a, button')]
      const at = choices.indexOf(document.activeElement as HTMLElement)
      const next = event.shiftKey ? (at <= 0 ? choices.length - 1 : at - 1) : (at + 1) % choices.length
      event.preventDefault()
      choices[next]?.focus()
    }
    document.addEventListener('keydown', keys)
    return () => {
      document.removeEventListener('keydown', keys)
      opener?.focus()
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end lg:items-center lg:justify-center">
      <div aria-hidden="true" data-veil="" onClick={onClose} className="absolute inset-0 bg-ground/70" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
        className="relative w-full animate-board-in border-t border-rule-strong bg-ground px-5 pt-6 pb-5 motion-reduce:animate-none lg:max-w-md lg:rounded-control lg:border"
      >
        <h2 id={titleId} className="text-title font-semibold leading-tight tracking-[-0.01em]">
          {title}
        </h2>
        <p id={textId} className="mt-2 text-body leading-relaxed text-ink-soft">
          {text}
        </p>
        {children}
      </div>
    </div>
  )
}
