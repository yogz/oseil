import type { ComponentProps } from 'react'

// A <button>'s own props, `ref` included: a screen can move the focus to it.
type ButtonProps = ComponentProps<'button'> & {
  variant?: 'primary' | 'secondary' | 'danger'
  // As wide as its words, for a pill that shares a line (« Terminé » beside a note), instead of the full width.
  fit?: boolean
}

// A pill, full width on a phone (unless `fit`), at least 48 px high: a thumb finds it.
const BASE =
  'inline-flex items-center justify-center rounded-full px-6 text-center ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ' +
  'disabled:cursor-not-allowed disabled:opacity-40'

const VARIANTS = {
  // The one thing to do on the screen: light on dark.
  primary: 'min-h-13 bg-ink text-body font-semibold text-ground',
  // Everything else: an outline.
  secondary: 'min-h-12 border border-rule-strong bg-transparent text-body font-medium text-ink',
  // The outline in the colour of a loss: only « Supprimer mon compte et mes chiffres » (Nicolas, 12 November 2026).
  danger: 'min-h-12 border border-loss bg-transparent text-body font-semibold text-loss',
} as const

export function Button({ variant = 'primary', fit = false, type = 'button', className, ...props }: ButtonProps) {
  const width = fit ? 'w-auto shrink-0' : 'w-full'
  return <button type={type} className={[BASE, width, VARIANTS[variant], className].filter(Boolean).join(' ')} {...props} />
}
