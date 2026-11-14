import type { AccountTypeId, Cents, IsoDate } from '@/lib/model/types'

// The livrets whose rate the State sets: their yearly interest, paid each 31 December, is estimated
// from the official rates and counted as markets, not effort
// (docs/superpowers/specs/2026-11-14-interets-livrets-design.md). The LDDS has the Livret A rate.
export type EstimatedLivret = 'livret-a' | 'ldds' | 'lep'

export function isEstimatedLivret(type: AccountTypeId): type is EstimatedLivret {
  return type === 'livret-a' || type === 'ldds' || type === 'lep'
}

// The rates in force from each date (a fraction: 0.017 is 1,7 %), each read on the Banque de France.
// The table starts on 1 August 2014, the first date checked: no estimate for a year before 2015.
// After the last date, the last rate holds. Update the table at each change of rate (1 February,
// 1 August, at most twice a year), from an official source only.
//
// Sources (Banque de France, rapports annuels sur l’épargne réglementée, annexe « cadre juridique »,
// and its news pages):
// Gap: no source states 1 August 2020, 1 February 2021 or 1 August 2021, so those dates are left out
// (unchanged rates, read from the 2020 to 2022 reports). LEP 2023: the foreword and annex of the 2023
// report say 6 % from 1 August 2023 and 5 % from 1 February 2024; one body paragraph says 5 % from
// 1 August: the table follows the annex.
// - 1 August 2014 (Livret A 1 %, LEP 1,5 %): rapport 2014,
//   https://publications.banque-france.fr/sites/default/files/media/2016/10/05/observatoire-de-l-epargne-reglementee-rapport_2014.pdf
// - 1 August 2015 (0,75 %, 1,25 %) and 1 February 2020 (0,5 %, 1 %): rapport 2019,
//   https://publications.banque-france.fr/sites/default/files/medias/documents/rapport-er_2019.pdf
//   (and rapport 2020, « 0,5 % depuis le 1er février 2020 », « 1 % depuis le 1er février 2020 »,
//   https://publications.banque-france.fr/sites/default/files/medias/documents/rapport_er_2020.pdf)
// - 1 February 2022 (1 %, 2,2 %), 1 August 2022 (2 %, 4,6 %), 1 February 2023 (3 %, 6,1 %): rapport 2022,
//   https://www.banque-france.fr/system/files/2023-08/er-2022_rapport_web.pdf
// - 1 August 2023 (LEP 6 %), 1 February 2024 (LEP 5 %): rapport 2023,
//   https://www.banque-france.fr/system/files/2024-07/ER-2023_web.pdf
// - 1 August 2024 (LEP 4 %), Livret A at 3 % until 31 January 2025, 1 February 2025 (2,4 %, 3,5 %): rapport 2024,
//   https://www.banque-france.fr/system/files/2025-07/ER-2024_Annexe-4_Cadre-juridique.pdf
// - 1 August 2025 (1,7 %, 2,7 %), 1 February 2026 (1,5 %, 2,5 %): rapport 2025,
//   https://www.banque-france.fr/system/files/2026-07/ER2025_A4_Cadre-juridique.pdf
// - 1 August 2026 (Livret A 1,7 %, LEP « maintenu à 2,5 % »), page of 31 July 2026,
//   https://www.banque-france.fr/fr/actualites/livrets-depargne-reglementee-leur-remuneration-change
export const LIVRET_RATES: Record<'livret-a' | 'lep', Array<{ from: IsoDate; rate: number }>> = {
  'livret-a': [
    { from: '2014-08-01', rate: 0.01 },
    { from: '2015-08-01', rate: 0.0075 },
    { from: '2020-02-01', rate: 0.005 },
    { from: '2022-02-01', rate: 0.01 },
    { from: '2022-08-01', rate: 0.02 },
    { from: '2023-02-01', rate: 0.03 },
    { from: '2025-02-01', rate: 0.024 },
    { from: '2025-08-01', rate: 0.017 },
    { from: '2026-02-01', rate: 0.015 },
    { from: '2026-08-01', rate: 0.017 },
  ],
  lep: [
    { from: '2014-08-01', rate: 0.015 },
    { from: '2015-08-01', rate: 0.0125 },
    { from: '2020-02-01', rate: 0.01 },
    { from: '2022-02-01', rate: 0.022 },
    { from: '2022-08-01', rate: 0.046 },
    { from: '2023-02-01', rate: 0.061 },
    { from: '2023-08-01', rate: 0.06 },
    { from: '2024-02-01', rate: 0.05 },
    { from: '2024-08-01', rate: 0.04 },
    { from: '2025-02-01', rate: 0.035 },
    { from: '2025-08-01', rate: 0.027 },
    { from: '2026-02-01', rate: 0.025 },
  ],
}

const DAY = 86_400_000
const dayOf = (date: IsoDate) => Date.parse(`${date}T00:00:00Z`) / DAY

// The year's average rate, each rate weighted by its days in force; null when the year begins
// before the table.
export function yearlyRate(type: EstimatedLivret, year: number): number | null {
  const rates = LIVRET_RATES[type === 'ldds' ? 'livret-a' : type]
  const start = dayOf(`${year}-01-01`)
  const end = dayOf(`${year + 1}-01-01`)
  if (rates.length === 0 || dayOf(rates[0].from) > start) return null
  let weighted = 0
  for (let i = 0; i < rates.length; i++) {
    const from = Math.max(dayOf(rates[i].from), start)
    const to = Math.min(i + 1 < rates.length ? dayOf(rates[i + 1].from) : end, end)
    if (to > from) weighted += (to - from) * rates[i].rate
  }
  return weighted / (end - start)
}

// The interest paid on each 31 December D with before ≤ D < after, each year on the same balance
// (the one held at `before`), rounded to the cent per year. A year before the table adds nothing.
export function estimatedInterest(type: EstimatedLivret, balance: Cents, before: IsoDate, after: IsoDate): Cents {
  if (balance <= 0) return 0
  let interest = 0
  for (let year = Number(before.slice(0, 4)); year <= Number(after.slice(0, 4)); year++) {
    const december31 = `${year}-12-31`
    if (december31 < before || december31 >= after) continue
    const rate = yearlyRate(type, year)
    if (rate !== null) interest += Math.round(balance * rate)
  }
  return interest
}
