// Class names shared by the Réglages sections. Tokens only.

import { FOCUS } from '@/components/setup/styles'

// `scroll-mt-*`: a section reached by its anchor (« Trouver ») keeps its title clear of the menu fixed at
// the top of a computer, and of the screen's edge on a phone.
export const SECTION = 'mt-6 flex scroll-mt-4 flex-col gap-3 border-t border-hairline pt-5 lg:scroll-mt-24'
export const SECTION_TITLE = 'text-subtitle font-semibold'
export const SENTENCE = 'text-body leading-relaxed text-ink'
export const NOTE = 'text-caption leading-relaxed text-ink-soft'
// A section title that opens a screen: a row with « › » on the right, its link stretched over the section
// (which must be `relative`); the focus ring is drawn around the whole block, as the finger sees it.
export const TITLE_LINK =
  'flex min-h-11 items-center justify-between gap-3 text-ink after:absolute after:inset-0 ' +
  'focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ink'
export const ROW_LINK = `flex min-h-11 items-center justify-between gap-3 text-body text-ink ${FOCUS}`
export const SMALL_BUTTON = `inline-flex min-h-11 items-center text-body text-ink underline decoration-rule-strong underline-offset-4 disabled:opacity-40 ${FOCUS}`
export const ARROW_BUTTON = `inline-flex size-11 items-center justify-center rounded-full border border-rule-strong text-subtitle text-ink disabled:opacity-40 ${FOCUS}`
