'use client'

// The import of a whole file into an empty vault: choose the file, read it all without
// writing anything, then either the errors to correct in the file, or a preview and
// « Importer ces chiffres ». Offered only while the vault is empty (isVaultEmpty); anything
// else goes back to Mon argent. The saving itself is lib/transfer/save-import.ts.
//
// Two tabs importing at the same time are not guarded: the database holds one profile per
// person, so the second placeholder insert is refused, but the leftovers each tab clears are
// only those it read. Rare enough to leave unguarded; this note says it is known.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { SignOutFrame } from '@/components/account/SignOutFrame'
import { LoadFailed } from '@/components/setup/Notices'
import { BACK, TEXT_LINK } from '@/components/setup/styles'
import { ImportErrors } from '@/components/transfer/ImportErrors'
import { ImportPreview } from '@/components/transfer/ImportPreview'
import { Button } from '@/components/ui/Button'
import { VaultWait, WaitCover } from '@/components/ui/VaultWait'
import type { Model, ModelState } from '@/lib/app/use-model'
import { useModel } from '@/lib/app/use-model'
import { downloadBlob } from '@/lib/transfer/download'
import { TEMPLATE_FILE_NAME, templateSheets } from '@/lib/transfer/export'
import { AI_PROMPT } from '@/lib/transfer/instructions'
import { importFile, type ImportedData, type ImportSummary } from '@/lib/transfer/import'
import type { ImportError } from '@/lib/transfer/import-types'
import { isVaultEmpty, saveImport, VaultNotEmptyError } from '@/lib/transfer/save-import'
import { writeWorkbook } from '@/lib/transfer/xlsx'

type Ready = Extract<ModelState, { status: 'ready' }>

// What the screen shows under its title, after a file is chosen.
type Step =
  | { kind: 'choose' }
  | { kind: 'reading' }
  | { kind: 'errors'; errors: ImportError[] }
  | { kind: 'preview'; data: ImportedData; summary: ImportSummary }

const ACCEPT = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const SAVE_FAILED = 'L’import n’a pas abouti, rien n’est enregistré. Réessaie.'
const TEMPLATE_FAILED = 'Le modèle n’a pas pu être préparé. Réessaie.'
const WAY_TITLE = 'text-subtitle font-semibold text-ink'
// Plain links to three assistants: nothing goes with them, the prompt is pasted by the person.
const CHATGPT = 'https://chatgpt.com/'
const CLAUDE = 'https://claude.ai/new'
const GEMINI = 'https://gemini.google.com/app'

export default function ImportPage() {
  return (
    <SignOutFrame>
      <Importer />
    </SignOutFrame>
  )
}

function Importer() {
  const state = useModel()
  const router = useRouter()
  const ready = state.status === 'ready' ? state : null
  // Only into an empty vault: the import never replaces anything.
  const notEmpty = ready !== null && !isVaultEmpty(ready.model)
  useEffect(() => {
    if (notEmpty) router.replace('/')
  }, [notEmpty, router])

  return (
    <div className="flex flex-col">
      <Link href="/premier-lancement" className={BACK}>
        ‹ Retour
      </Link>
      <h1 className="pt-2 text-title font-semibold leading-tight tracking-[-0.01em]">Tes chiffres depuis un fichier</h1>
      {state.status === 'failed' || state.status === 'unavailable' ? (
        <div className="mt-4">
          <LoadFailed retry={state.retry} />
        </div>
      ) : null}
      {state.status === 'loading' ? <VaultWait phase="open" /> : null}
      {ready && !notEmpty ? <Steps ready={ready} /> : null}
    </div>
  )
}

function Steps({ ready }: { ready: Ready }) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>({ kind: 'choose' })
  // Each choice of a file is counted: a reading that ends after another choice is dropped.
  const readings = useRef(0)

  // The saving. `busy` is set before anything else, so a double click writes once.
  const busy = useRef(false)
  const [saving, setSaving] = useState(false)
  // Only what the screen says: choosing another file clears the sentence, never `mustReload`.
  const [failed, setFailed] = useState(false)
  // Set by every failure, cleared only once a new reading of the vault has arrived: until then,
  // nothing is written with the model the failure was met with, whatever file is chosen next
  // (what the failed import could not delete is only in a new reading).
  const mustReload = useRef(false)
  // While a reading is awaited, the model it replaces. If that reading fails, the screen says so
  // and drops the chosen file: once the vault loads again, the file is chosen again (nothing has
  // been written).
  const retryAfter = useRef<Model | null>(null)

  const [template, setTemplate] = useState<'idle' | 'busy' | 'failed'>('idle')

  async function chosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // The same file can be chosen again once corrected.
    event.target.value = ''
    if (!file) return
    const reading = ++readings.current
    setFailed(false)
    setStep({ kind: 'reading' })
    const result = await importFile(file)
    if (reading !== readings.current) return
    setStep(result.ok ? { kind: 'preview', data: result.data, summary: result.summary } : { kind: 'errors', errors: result.errors })
  }

  async function write(target: Ready, data: ImportedData) {
    try {
      await saveImport(target.client, target.dataKey, target.model, data)
    } catch (error) {
      // Refused because the vault is no longer empty: on a retry, the profile write of the
      // failed attempt had landed (its answer was lost). The import is there: Mon argent.
      if (!(error instanceof VaultNotEmptyError)) {
        console.error(error)
        mustReload.current = true
        busy.current = false
        setSaving(false)
        setFailed(true)
        return
      }
    }
    router.replace('/')
  }

  function importNow() {
    if (busy.current || step.kind !== 'preview') return
    busy.current = true
    setSaving(true)
    setFailed(false)
    if (mustReload.current) {
      retryAfter.current = ready.model
      ready.reload()
      return
    }
    void write(ready, step.data)
  }

  // The retry, once the vault has been read again.
  useEffect(() => {
    const stale = retryAfter.current
    if (stale === null || ready.model === stale || step.kind !== 'preview') return
    retryAfter.current = null
    mustReload.current = false
    void write(ready, step.data)
  })

  async function downloadTemplate() {
    setTemplate('busy')
    try {
      downloadBlob(await writeWorkbook(templateSheets()), TEMPLATE_FILE_NAME)
      setTemplate('idle')
    } catch (error) {
      console.error(error)
      setTemplate('failed')
    }
  }

  const choose = () => input.current?.click()

  return (
    <>
      <input ref={input} type="file" accept={ACCEPT} className="hidden" tabIndex={-1} aria-hidden="true" onChange={chosen} />

      {step.kind === 'preview' ? (
        <WaitCover active={saving} phase="lock">
          <div className="mt-6 flex flex-col">
            <ImportPreview summary={step.summary} />
            <div className="mt-6 flex flex-col gap-3">
              <Button disabled={saving} onClick={importNow}>
                Importer ces chiffres
              </Button>
              {failed ? (
                <p role="alert" className="text-body leading-relaxed text-ink">
                  {SAVE_FAILED}
                </p>
              ) : null}
              <button type="button" disabled={saving} className={`${TEXT_LINK} disabled:opacity-40`} onClick={choose}>
                Choisir un autre fichier
              </button>
            </div>
          </div>
        </WaitCover>
      ) : (
        <>
          <p className="mt-2 text-body leading-relaxed text-ink-soft">
            Rien n’est enregistré avant que tu aies vu ce que contient le fichier.
          </p>
          {step.kind === 'errors' ? (
            <div className="mt-6">
              <ImportErrors errors={step.errors} />
            </div>
          ) : null}
          {/* Three ways (Nicolas, 10 November 2026): a file already there (a backup of Oseil, a
              template filled, or the file an AI gave back), made with an AI, or filled by hand. The
              AI way needs no template since the prompt carries the whole of it. */}
          <div className="mt-6">
            <Button disabled={step.kind === 'reading'} onClick={choose}>
              Choisir le fichier
            </Button>
          </div>
          <p className="mt-2 text-caption leading-normal text-ink-muted">
            Ta sauvegarde Oseil, un modèle rempli ou le fichier rendu par l’IA. Depuis Numbers, exporte d’abord en
            Excel&nbsp;: Partager › Exporter › Excel.
          </p>
          {step.kind === 'reading' ? (
            <p role="status" className="mt-3 text-caption text-ink-muted">
              Lecture du fichier…
            </p>
          ) : null}

          <p className="mt-10 text-body leading-relaxed text-ink-soft">Pas encore de fichier&nbsp;? Deux façons d’en faire un.</p>

          <div className="mt-4 flex items-center gap-2">
            <h2 className={WAY_TITLE}>Avec ton IA</h2>
            {/* The AI way only, not the import (Nicolas, 10 November 2026): what an AI writes is
                not under Oseil's hand. */}
            <span className="inline-flex items-center rounded-full border border-rule-strong px-2 text-caption text-ink-soft">
              Expérimental
            </span>
          </div>
          <p className="mt-1 text-body leading-relaxed text-ink-soft">
            ChatGPT, Claude, Gemini… Le plus rapide. Une IA peut se tromper&nbsp;: relis l’aperçu avant d’importer.
          </p>
          <ol className="mt-3 flex list-decimal flex-col gap-3 pl-5 text-body leading-relaxed text-ink marker:text-ink-muted">
            <li>
              Copie la consigne.
              <AiPrompt />
            </li>
            <li>
              Colle-la dans ton IA, sans rien joindre, et donne-lui ce que tu as déjà&nbsp;: ton propre
              tableau, des captures de tes applis de banque, des relevés.
              <span className="flex flex-wrap items-center gap-x-3">
                <span className="text-ink-soft">Ouvrir&nbsp;:</span>
                <a href={CHATGPT} target="_blank" rel="noopener noreferrer" aria-label="Ouvrir ChatGPT" className={TEXT_LINK}>
                  ChatGPT
                </a>
                <a href={CLAUDE} target="_blank" rel="noopener noreferrer" aria-label="Ouvrir Claude" className={TEXT_LINK}>
                  Claude
                </a>
                <a href={GEMINI} target="_blank" rel="noopener noreferrer" aria-label="Ouvrir Gemini" className={TEXT_LINK}>
                  Gemini
                </a>
              </span>
            </li>
            <li>Reviens ici et choisis le fichier qu’elle te rend.</li>
          </ol>
          <p className="mt-3 text-body leading-relaxed text-ink">Tes chiffres seront lus par cette IA, pas par Oseil.</p>

          <h2 className={`mt-10 ${WAY_TITLE}`}>À la main</h2>
          <p className="mt-1 text-body leading-relaxed text-ink-soft">
            Télécharge le modèle, remplis-le sur ordinateur, un onglet après l’autre, puis reviens ici.
          </p>
          <button
            type="button"
            disabled={template === 'busy'}
            className={`${TEXT_LINK} disabled:opacity-40`}
            onClick={downloadTemplate}
          >
            Télécharger le modèle
          </button>
          {template === 'failed' ? (
            <p role="alert" className="text-body leading-relaxed text-ink">
              {TEMPLATE_FAILED}
            </p>
          ) : null}
        </>
      )}
    </>
  )
}

// The words to paste into the AI, copied by a touch. The whole text stays one touch away under
// « Lire la consigne » (what is pasted is never hidden), folded since it carries the file's whole
// instructions. Without a clipboard (refused, an old browser), the text opens, selected by a touch.
function AiPrompt() {
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(AI_PROMPT)
      setCopied(true)
    } catch {
      setOpen(true)
    }
  }
  return (
    <div className="mt-2 flex flex-col items-start gap-1">
      <Button variant="secondary" onClick={copy}>
        {copied ? 'Consigne copiée' : 'Copier la consigne'}
      </Button>
      <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="self-stretch">
        <summary className={`${TEXT_LINK} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
          {open ? 'Replier la consigne' : 'Lire la consigne'}
        </summary>
        <p
          data-testid="ai-prompt"
          className="mt-2 max-h-64 overflow-y-auto whitespace-pre-line rounded-control bg-field p-3 text-caption leading-normal text-ink-soft select-all"
        >
          {AI_PROMPT}
        </p>
      </details>
    </div>
  )
}
