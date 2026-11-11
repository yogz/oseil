// Class names shared by the Réglages sections. Tokens only.

import { FOCUS } from '@/components/setup/styles'

export const SECTION = 'mt-6 flex flex-col gap-3 border-t border-hairline pt-5'
export const SECTION_TITLE = 'text-subtitle font-semibold'
export const SENTENCE = 'text-body leading-relaxed text-ink'
export const NOTE = 'text-caption leading-relaxed text-ink-soft'
export const ROW_LINK = `flex min-h-11 items-center justify-between gap-3 text-body text-ink ${FOCUS}`
export const SMALL_BUTTON = `inline-flex min-h-11 items-center text-body text-ink underline decoration-rule-strong underline-offset-4 disabled:opacity-40 ${FOCUS}`
export const ARROW_BUTTON = `inline-flex size-11 items-center justify-center rounded-full border border-rule-strong text-subtitle text-ink disabled:opacity-40 ${FOCUS}`
