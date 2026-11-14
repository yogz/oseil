'use client'

import type { ModelState } from '@/lib/app/use-model'
import { DATA_NOTE, DATA_TITLE } from '@/lib/screens/settings-words'
import { DownloadFiguresButton } from './DownloadFiguresButton'
import { NOTE, SECTION, SECTION_TITLE } from './styles'
import { SETTINGS_ANCHORS } from '@/lib/screens/find-words'

type Ready = Extract<ModelState, { status: 'ready' }>

// « Mes chiffres en fichier »: everything finished, in the clear, as an Excel file.
export function DataSection({ state }: { state: Ready }) {
  return (
    <section id={SETTINGS_ANCHORS.data} aria-label={DATA_TITLE} className={SECTION}>
      <h2 className={SECTION_TITLE}>{DATA_TITLE}</h2>
      <p className={NOTE}>{DATA_NOTE}</p>
      <DownloadFiguresButton model={state.model} />
    </section>
  )
}
