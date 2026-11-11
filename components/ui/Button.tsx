import type { ComponentProps } from 'react'

// A <button>'s own props, `ref` included: a screen can move the focus to it.
type ButtonProps = ComponentProps<'button'> & {
  variant?: 'primary' | 'secondary'
}

// A pill, full width on a phone, at least 48 px high: a thumb finds it.
const BASE =
  'inline-flex w-full items-center justify-center rounded-full px-6 text-center ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ' +
  'disabled:cursor-not-allowed disabled:opacity-40'

const VARIANTS = {
  // The one thing to do on the screen: light on dark.
  primary: 'min-h-13 bg-ink text-body font-semibold text-ground',
  // Everything else: an outline.
  secondary: 'min-h-12 border border-rule-strong bg-transparent text-body font-medium text-ink',
} as const

export function Button({ variant = 'primary', type = 'button', className, ...props }: ButtonProps) {
  return <button type={type} className={[BASE, VARIANTS[variant], className].filter(Boolean).join(' ')} {...props} />
}
