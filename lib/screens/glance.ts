// The two glance cards of Mon argent on a computer (planche 20): a look at Repères (the cushion)
// and at Évolution (the progress since the first snapshot). Both come from the views of those
// screens, so they say the same thing and are masked the same way.

import type { Model } from '@/lib/app/use-model'
import type { IsoDate } from '@/lib/model/types'
import type { Market } from '@/lib/market/types'
import { EVOLUTION_ON_YOURS } from './evolution-words'
import { evolutionView } from './evolution'
import { CUSHION_TITLE, monthsWords } from './reperes-words'
import { reperesView } from './reperes'

export type Glance = {
  cushion: { title: string; href: string; big: string | null; sentence: string } | null
  progress: { title: string; href: string; big: string; sentence: string } | null
}

export function glanceOf(model: Model, today: IsoDate, market: Market | null): Glance {
  const reperes = reperesView(model, today, market)
  const cushion =
    reperes.kind === 'ready'
      ? 'missing' in reperes.cushion
        ? { title: CUSHION_TITLE, href: '/reperes', big: null, sentence: reperes.cushion.missing }
        : {
            title: CUSHION_TITLE,
            href: '/reperes',
            big: monthsWords(reperes.cushion.months),
            sentence: reperes.cushion.sentence,
          }
      : null

  const evolution = evolutionView(model, today)
  const progress =
    evolution.kind === 'history'
      ? {
          title: `Depuis ${evolution.sinceFirst.firstLabel}`,
          href: '/evolution',
          big: evolution.sinceFirst.euros,
          sentence: EVOLUTION_ON_YOURS,
        }
      : null

  return { cushion, progress }
}
