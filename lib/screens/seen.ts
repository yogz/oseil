// Which establishments a snapshot did not review, and how the result says so
// (spec, « La mise à jour inachevée »). Pure: no React, no database.

import { formatDayMonth } from '@/lib/format'
import { EXCEPT_TODAYS_PRICES } from '@/lib/market/words'
import type { Establishment, IsoDate, Profile, Snapshot } from '@/lib/model/types'
import { steps } from '@/lib/setup/first-launch'

export type Behind = { establishment: Establishment; seenOn: IsoDate }

// In the order of the steps. An establishment is behind when the oldest date among its
// lines is on or before `previous`, the snapshot before (F7): a line left unseen keeps it
// behind, even when another one was typed. With no previous snapshot, as after a first
// launch spread over several days, none is. It is listed with that oldest date, unless
// that is the snapshot's own day (two snapshots the same day: a bank reviewed that day).
// The house is left out: it carries its own estimate date (« estimée le »), which a
// confirmation keeps (decision 3).
export function behindEstablishments(profile: Profile, snapshot: Snapshot, previous: Snapshot | undefined): Behind[] {
  if (previous === undefined) return []
  const lines = new Map(profile.lines.map((l) => [l.id, l]))
  const accounts = new Map(profile.accounts.map((a) => [a.id, a]))
  const oldest = new Map<string, IsoDate>()
  for (const entry of snapshot.entries) {
    const line = lines.get(entry.lineId)
    const account = line && accounts.get(line.accountId)
    if (!account || account.type === 'home') continue
    const seen = oldest.get(account.establishmentId)
    if (seen === undefined || entry.seenOn < seen) oldest.set(account.establishmentId, entry.seenOn)
  }
  return steps(profile).flatMap((establishment) => {
    const seenOn = oldest.get(establishment.id)
    if (seenOn === undefined || seenOn > previous.takenOn || seenOn >= snapshot.takenOn) return []
    return [{ establishment, seenOn }]
  })
}

// « 2 banques non revues : leurs chiffres datent du 30 septembre » (spec). With several dates,
// the most recent one « ou d’avant ». With « Chez toi » among them, which is no bank, each is named.
// `todaysPrices`: shares of these establishments took today's price all the same, so their
// figures are old except that price, and the sentence says so.
export function notReviewedSentence(behind: Behind[], today: IsoDate, todaysPrices = false): string | null {
  if (behind.length === 0) return null
  const dates = behind.map((b) => b.seenOn).sort()
  const newest = dates[dates.length - 1]
  const day = dates[0] === newest ? formatDayMonth(newest, today) : `${formatDayMonth(newest, today)} ou d’avant`
  const when = todaysPrices ? `${day}, ${EXCEPT_TODAYS_PRICES}` : day
  const several = behind.length > 1

  if (behind.some((b) => b.establishment.kind === 'home')) {
    const names = behind.map((b) => b.establishment.name).join(', ')
    return several
      ? `Pas revus cette fois\u00A0: ${names}. Leurs chiffres datent du ${when}.`
      : `Pas revu cette fois\u00A0: ${names}. Ses chiffres datent du ${when}.`
  }
  return several
    ? `${behind.length} banques non revues\u00A0: leurs chiffres datent du ${when}`
    : `1 banque non revue\u00A0: ses chiffres datent du ${when}`
}

// « 1 banque pas revue depuis le 30 septembre », « 6 banques pas revues depuis le 5 novembre »: short,
// whatever their number (Nicolas, 10 November 2026; the list of names read as banks seen on the date
// before it). With several dates, the most recent one « ou d’avant », as `notReviewedSentence` says it.
export function olderDatesLabel(behind: Behind[], today: IsoDate): string | null {
  if (behind.length === 0) return null
  const dates = behind.map((b) => b.seenOn).sort()
  const newest = dates[dates.length - 1]
  const day = dates[0] === newest ? formatDayMonth(newest, today) : `${formatDayMonth(newest, today)} ou d’avant`
  // « Chez toi » (gold or crypto kept by the person) is no bank: it is named, the banks counted.
  const home = behind.find((b) => b.establishment.kind === 'home')
  const banks = behind.length - (home ? 1 : 0)
  const counted = banks > 1 ? `${banks} banques` : `1 banque`
  if (!home) return `${counted} pas revue${banks > 1 ? 's' : ''} depuis le ${day}`
  if (banks === 0) return `${home.establishment.name} pas revu depuis le ${day}`
  return `${home.establishment.name} et ${counted} pas revus depuis le ${day}`
}
