'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { Model } from '@/lib/app/use-model'
import { todayIso } from '@/lib/dates'
import { DATA_DONE, DATA_DOWNLOAD, DATA_DRAFT, DATA_FAILED, DATA_NO_PROFILE } from '@/lib/screens/settings-words'
import { downloadBlob } from '@/lib/transfer/download'
import { exportFileName, exportSheets } from '@/lib/transfer/export'
import { unreadableLines } from '@/lib/transfer/instructions'
import { NOTE, SENTENCE } from './styles'

// A profile that exists but cannot be read: the relevés name lines that no empty profile knows, so
// the file cannot be written, and « Réessaie » would never help. A new account (no profile, nothing
// unreadable) still gets its nearly empty file.
export function downloadBlocked(model: Model): boolean {
  return model.profile === null && model.unreadable.profile > 0
}

// « Télécharger mes chiffres »: everything finished, in the clear, as an Excel file, with what it says
// around the button: what the file leaves out (the update in progress, what could not be read), or why
// it cannot be prepared. The same in the Réglages and before deleting the account, where the file is the
// only trace left, so its gaps are said there too. The libraries that write the file are loaded by
// `writeWorkbook` only when the button is pressed.
export function DownloadFiguresButton({ model }: { model: Model }) {
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<'done' | 'failed' | null>(null)
  const blocked = downloadBlocked(model)
  const unreadable = unreadableLines(model.unreadable)

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
    <>
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
    </>
  )
}
