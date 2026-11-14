// Class names shared by the first-launch screens. Tokens only.

export const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
export const BACK = `inline-flex min-h-11 items-center self-start text-body text-ink-soft ${FOCUS}`
export const CHIP =
  `inline-flex min-h-11 items-center rounded-full border px-4 text-body ${FOCUS} ` +
  'aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:font-semibold aria-pressed:text-ground ' +
  'border-rule-strong text-ink'
export const TEXT_LINK = `inline-flex min-h-11 items-center self-start text-body text-ink underline decoration-rule-strong underline-offset-4 ${FOCUS}`
// A secondary action, in place, under or beside the main one: « Je ne sais pas », « Pas coté », « Changer ».
export const SMALL_LINK = `inline-flex min-h-11 items-center self-start text-caption text-ink-soft underline decoration-rule-strong underline-offset-4 ${FOCUS}`
