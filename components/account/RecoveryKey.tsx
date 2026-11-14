'use client'

import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { GROUP_ORDINALS, groupMatches, nextGroup } from '@/lib/auth/recovery-check'
import { RecoveryKeyReplacedError } from '@/lib/vault/store'

type RecoveryKeyProps = {
  /** The key as the vault shows it: 8 groups of 4 characters, joined by dashes. */
  display: string
  /**
   * Rejects when the key could not be confirmed: the screen then stays and says so
   * (a `RecoveryKeyReplacedError` has its own message).
   */
  onContinue: () => Promise<void>
  /** The key replaces one that was shown earlier and never confirmed. */
  renewed?: boolean
  /** The page already has its own h1: the title is then an h2. */
  subtitle?: boolean
  /** Which group to ask for, given the one asked just before (tests choose it). */
  pickGroup?: (previous: number | null) => number
}

const TITLE = 'text-title font-semibold leading-tight tracking-[-0.01em] focus:outline-none'
const LINK =
  'inline-flex min-h-11 items-center self-start text-body text-ink-soft underline decoration-rule-strong ' +
  'underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
// Whether the device can share never changes while the page is open.
const noChange = () => () => {}
const WRONG_GROUP = 'Ce n’est pas ce morceau-là. Relis ta clé, ou touche « Oups, revoir ma clé ».'

// Shown once: right after the vault is created, after starting over, or when
// a key that was never confirmed is replaced. Nothing here keeps the key: it
// is on the screen, in the clipboard if the person copies it, in whatever the
// person shares it to, and gone when they leave.
//
// Two steps (decided by Nicolas on 11 November 2026): the key, then one of its
// groups typed back while it is hidden. A ticked box proved nothing; a group
// can only be typed from wherever the key was put away. Looking at the key
// again asks for another group.
export function RecoveryKey({
  display,
  onContinue,
  renewed = false,
  subtitle = false,
  pickGroup = nextGroup,
}: RecoveryKeyProps) {
  // The group asked for, or null while the key is on screen.
  const [asked, setAsked] = useState<number | null>(null)
  // The last group asked, so that looking at the key again asks for another.
  const lastAsked = useRef<number | null>(null)
  const [typed, setTyped] = useState('')
  const [wrong, setWrong] = useState(false)
  const [copied, setCopied] = useState(false)
  // Known once the page runs in the browser: the server cannot tell, and says no.
  const canShare = useSyncExternalStore(
    noChange,
    () => typeof navigator.share === 'function',
    () => false,
  )
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<'replaced' | 'other' | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const moved = useRef(false)
  const groups = display.split('-')
  const Title = subtitle ? 'h2' : 'h1'

  // Each step announces itself: the focus goes to its title (not on the first drawing).
  useEffect(() => {
    if (moved.current) heading.current?.focus()
  }, [asked])

  async function copy() {
    try {
      await navigator.clipboard.writeText(display)
      setCopied(true)
    } catch {
      // No clipboard (refused, or an old browser): the key stays on screen,
      // and a touch selects all of it.
    }
  }

  async function share() {
    try {
      await navigator.share({ text: `Ma clé de secours Oseil : ${display}` })
    } catch {
      // Closed without choosing, or refused: the key stays on screen.
    }
  }

  function toCheck() {
    const group = pickGroup(lastAsked.current)
    lastAsked.current = group
    moved.current = true
    setTyped('')
    setWrong(false)
    setFailed(null)
    setAsked(group)
  }

  function toKey() {
    moved.current = true
    setAsked(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (asked === null) return
    if (!groupMatches(display, asked, typed)) {
      setWrong(true)
      return
    }
    setWrong(false)
    setBusy(true)
    setFailed(null)
    try {
      await onContinue()
    } catch (error) {
      setFailed(error instanceof RecoveryKeyReplacedError ? 'replaced' : 'other')
      setBusy(false)
    }
  }

  if (asked !== null) {
    const ordinal = GROUP_ORDINALS[asked]
    const label = ordinal.charAt(0).toLocaleUpperCase('fr') + ordinal.slice(1) + ' morceau'
    return (
      <form onSubmit={submit} className="flex flex-col" noValidate>
        <Title ref={heading} tabIndex={-1} className={TITLE}>
          Rangée pour de vrai&nbsp;?
        </Title>
        <p className="mt-3 text-body leading-relaxed text-ink-soft">
          Si oui, tape son {ordinal} morceau&nbsp;: deux secondes. Si tu as cliqué un peu vite (ça arrive à presque
          tout le monde), on te la remontre juste en dessous.
        </p>

        {/* The key, hidden, with the place of the asked group marked: the sentence above says which. */}
        <p
          aria-hidden="true"
          className="mt-8 border-y border-hairline py-6 text-center text-title font-semibold leading-relaxed tracking-wide text-ink-muted"
        >
          {groups.map((_, index) => (
            <Fragment key={index}>
              {index === asked ? (
                <span className="rounded-square bg-field px-1 text-ink outline outline-1 outline-rule-strong">&nbsp;?&nbsp;</span>
              ) : (
                '••••'
              )}
              {index < groups.length - 1 ? '-' : null}
              {index === groups.length / 2 - 1 ? <br /> : index < groups.length - 1 ? <wbr /> : null}
            </Fragment>
          ))}
        </p>

        <div className="mt-8">
          <TextField
            label={label}
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            value={typed}
            error={wrong ? WRONG_GROUP : undefined}
            onChange={(event) => {
              setTyped(event.target.value)
              setWrong(false)
            }}
          />
        </div>

        <button type="button" className={`mt-4 ${LINK}`} disabled={busy} onClick={toKey}>
          Oups, revoir ma clé
        </button>

        {failed ? (
          <p role="alert" className="mt-6 text-body font-medium leading-normal text-ink">
            {failed === 'replaced'
              ? "Cette clé ne marche plus : elle a été remplacée lors d’une connexion sur un autre appareil. Reconnecte-toi pour en recevoir une nouvelle."
              : "Ça n’a pas marché. Vérifie ton accès à internet et réessaie."}
          </p>
        ) : null}

        <Button
          type="submit"
          className="mt-6"
          disabled={typed.replace(/[\s-]/g, '').length !== 4 || busy}
          aria-busy={busy}
        >
          C’est fait
        </Button>
      </form>
    )
  }

  return (
    <div className="flex flex-col">
      <Title ref={heading} tabIndex={-1} className={TITLE}>
        Ta clé de secours
      </Title>
      {renewed ? (
        <p className="mt-3 text-body font-medium leading-relaxed text-ink">
          Tu n’avais pas confirmé avoir mis ta clé de secours de côté. En voici une nouvelle&nbsp;: l’ancienne ne
          marche plus.
        </p>
      ) : null}
      {/* One of the two warnings of the site in the colour of a loss (chosen by Nicolas on 11 November 2026;
          the other is on the delete-account screen). */}
      <p className="mt-3 border-l-2 border-loss pl-3 text-body leading-relaxed text-ink-soft">
        Si tu oublies ton mot de passe,{' '}
        <strong className="font-semibold text-loss">c’est la seule façon de retrouver tes chiffres.</strong> Personne
        ne peut les récupérer sans elle, pas même nous.
      </p>

      {/* Four groups per line, so the eight read as two rows of a grid; a
          narrower screen may still break after any dash. The text itself is
          the key exactly, dashes included. */}
      <p className="mt-8 select-all border-y border-hairline py-6 text-center text-title font-semibold leading-relaxed tracking-wide">
        {groups.map((group, index) => (
          <Fragment key={index}>
            {group}
            {index < groups.length - 1 ? '-' : null}
            {index === groups.length / 2 - 1 ? <br /> : index < groups.length - 1 ? <wbr /> : null}
          </Fragment>
        ))}
      </p>

      <div className={`mt-4 grid gap-3 ${canShare ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <Button variant="secondary" onClick={copy}>
          {copied ? 'Clé copiée' : 'Copier la clé'}
        </Button>
        {canShare ? (
          <Button variant="secondary" onClick={share}>
            Partager
          </Button>
        ) : null}
      </div>

      <p className="mt-6 text-body leading-relaxed text-ink-soft">
        Range-la maintenant, sur papier ou dans tes mots de passe. Tu en auras besoin juste après.
      </p>

      <Button className="mt-6" onClick={toCheck}>
        Je l’ai rangée
      </Button>
    </div>
  )
}
