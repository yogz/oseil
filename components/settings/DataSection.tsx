'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { ModelState } from '@/lib/app/use-model'
import { todayIso } from '@/lib/dates'
import {
  DATA_DONE,
  DATA_DOWNLOAD,
  DATA_DRAFT,
  DATA_FAILED,
  DATA_NO_PROFILE,
  DATA_NOTE,
  DATA_TITLE,
} from '@/lib/screens/settings-words'
import { downloadBlob } from '@/lib/transfer/download'
import { exportFileName, exportSheets } from '@/lib/transfer/export'
import { unreadableLines } from '@/lib/transfer/instructions'
import { NOTE, SECTION, SECTION_TITLE, SENTENCE } from './styles'

type Ready = Extract<ModelState, { status: 'ready' }>

// « Mes chiffres en fichier »: everything finished, in the clear, as an Excel file. The libraries that write it
// are loaded by `writeWorkbook` only when the button is pressed.
export function DataSection({ state }: { state: Ready }) {
  const { model } = state
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<'done' | 'failed' | null>(null)
  const unreadable = unreadableLines(model.unreadable)
  // A profile that exists but cannot be read: the relevés name lines that no empty profile knows, so
  // the file cannot be written, and « Réessaie » would never help. A new account (no profile, nothing
  // unreadable) still gets its nearly empty file.
  const blocked = model.profile === null && model.unreadable.profile > 0

  async function download() {
    if (blocked) return
    setBusy(true)
    setOutcome(null)
    try {
      const sheets = exportSheets({
        profile: model.profile?.value ?? { schema: 1, establishments: [], accounts: [], lines: [] },
        snapshots: model.snapshots.map((s) => s.value),
        goals: model.goals.map((g) => g.value),
        settings: model.settings?.value ?? null,
        unreadable: model.unreadable,
      })
      const { writeWorkbook } = await import('@/lib/transfer/xlsx')
      downloadBlob(await writeWorkbook(sheets), exportFileName(todayIso()))
      setOutcome('done')
    } catch (error) {
      console.error(error)
      setOutcome('failed')
    }
    setBusy(false)
  }

  return (
    <section aria-label={DATA_TITLE} className={SECTION}>
      <h2 className={SECTION_TITLE}>{DATA_TITLE}</h2>
      <p className={NOTE}>{DATA_NOTE}</p>
      {model.draft !== null ? <p className={NOTE}>{DATA_DRAFT}</p> : null}
      {/* Said from the start, so not an alert: an alert is read out as soon as the page opens. */}
      {blocked ? (
        <p className={SENTENCE}>{DATA_NO_PROFILE}</p>
      ) : unreadable.length > 0 ? (
        <p className={SENTENCE}>{unreadable.join(' ')}</p>
      ) : null}
      <Button variant="secondary" disabled={busy || blocked} onClick={download}>
        {DATA_DOWNLOAD}
      </Button>
      {outcome === 'failed' ? (
        <p role="alert" className={SENTENCE}>
          {DATA_FAILED}
        </p>
      ) : null}
      {outcome === 'done' ? (
        <p role="status" className={NOTE}>
          {DATA_DONE}
        </p>
      ) : null}
    </section>
  )
}
