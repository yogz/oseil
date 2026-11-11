'use client'

import { useId, useState, type InputHTMLAttributes } from 'react'

// `name` is left out on purpose. A form submitted before the page's code has
// loaded is sent by the browser itself, with every named field in the address
// — the password included. A field without a name is never sent: what leaves
// the device is only what the code derives from it.
type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'name' | 'id' | 'type' | 'className'> & {
  label: string
  type: 'email' | 'password' | 'text' | 'date'
  hint?: string
  error?: string
  /** A password that can be shown, and hidden again (planche 1 of the account screens). */
  revealable?: boolean
}

// The « Afficher » button sits inside the field, so only a field that has one gets a box around its
// input: every other field keeps its input right under its own block, as screens around it expect.
function Frame({ relative, children }: { relative: boolean; children: React.ReactNode }) {
  return relative ? <div className="relative">{children}</div> : <>{children}</>
}

export function TextField({ label, type, hint, error, revealable = false, ...input }: TextFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const [shown, setShown] = useState(false)
  const canShow = revealable && type === 'password'
  // An error takes the place of the hint: the rule is never written twice (planche 2).
  const describedBy = (error ? errorId : hint ? hintId : null) ?? undefined

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-body font-medium text-ink">
        {label}
      </label>
      <Frame relative={canShow}>
        <input
          id={id}
          type={canShow && shown ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          // 16 px at least, or a phone zooms into the field when it is touched.
          className={
            'min-h-13 w-full rounded-control bg-field px-4 text-subtitle text-ink ' +
            'placeholder:text-ink-muted focus-visible:border-ink focus-visible:outline-2 ' +
            'focus-visible:outline-offset-2 focus-visible:outline-ink ' +
            (canShow ? 'pr-24 ' : '') +
            (type === 'date' ? 'scheme-dark ' : '') +
            // A box of figures (inputMode decimal or numeric) lines its digits up; a box of words does not.
            (input.inputMode === 'decimal' || input.inputMode === 'numeric' ? 'tabular-nums ' : '') +
            // Without the loss colour, a field in error is told by a thicker edge in the colour of the text.
            (error ? 'border-2 border-ink' : 'border border-hairline')
          }
          {...input}
        />
        {canShow ? (
          <button
            type="button"
            // Its name says what a touch does; a pressed state on top would say it twice.
            aria-controls={id}
            onClick={() => setShown((s) => !s)}
            className={
              'absolute inset-y-0 right-0 flex min-w-11 items-center px-4 text-body text-ink-soft underline ' +
              'decoration-rule-strong underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
            }
          >
            {shown ? 'Masquer' : 'Afficher'}
          </button>
        ) : null}
      </Frame>
      {/* Right under the field, in place of the hint. Not in the loss colour:
          that one is kept for money actually lost. */}
      {error ? (
        <p id={errorId} role="alert" className="text-body font-semibold leading-normal text-ink">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-caption leading-normal text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
