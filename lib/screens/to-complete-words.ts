// The words of « À compléter » (docs/superpowers/specs/2026-11-12-a-completer-design.md). Each gap says
// what it brings, never a reproach.

import type { RangedCategory } from '@/lib/catalog'

export const TO_COMPLETE_TITLE = 'À compléter'
export const TO_COMPLETE_LEAD = 'Quelques réponses, et tes repères deviennent plus justes.'

// « Voir les 2 autres », « Voir l’autre »: what is folded behind the first three.
export const moreWords = (count: number) => (count === 1 ? 'Voir l’autre' : `Voir les ${count} autres`)

export const purchaseWhat = (count: number) =>
  count === 1 ? '1 titre sans prix d’achat' : `${count} titres sans prix d’achat`
export const PURCHASE_WHY = 'pour savoir ce que tes placements ont vraiment rapporté'
// The same gap, where the gain since purchase is told (the markets page), and in the bank update.
export const purchaseRowLabel = (count: number) =>
  count === 1 ? 'Ajoute son prix d’achat pour le compter ›' : 'Ajoute leur prix d’achat pour les compter ›'
export const PURCHASE_ASK = 'Tu as son prix d’achat sous les yeux ?'

export const quoteWhat = (count: number) =>
  count === 1 ? '1 titre qui ne suit pas son cours' : `${count} titres qui ne suivent pas leur cours`
export const quoteWhy = (count: number) =>
  count === 1 ? 'pour qu’il se mette à jour tout seul' : 'pour qu’ils se mettent à jour tout seuls'

// Placements en bourse is ranged by zone, Épargne sécurisée by type.
const RANGING: Record<RangedCategory, { one: string; many: string; why: string }> = {
  markets: {
    one: 'ligne de bourse pas rangée par zone',
    many: 'lignes de bourse pas rangées par zone',
    why: 'pour voir où ta bourse est placée dans le monde',
  },
  secured: {
    one: 'ligne d’épargne sécurisée pas rangée par type',
    many: 'lignes d’épargne sécurisée pas rangées par type',
    why: 'pour voir de quoi elle est faite',
  },
}
export const rangingWhat = (category: RangedCategory, count: number) =>
  `${count} ${count === 1 ? RANGING[category].one : RANGING[category].many}`
export const rangingWhy = (category: RangedCategory) => RANGING[category].why

export const unlockWhat = (accountName: string) => `${accountName}, sans date de déblocage`
export const UNLOCK_WHY = 'pour savoir quand cet argent se libère'

export const loanWhat = (accountName: string) => `${accountName}, relié à aucun logement`
export const LOAN_WHY = 'pour que ton logement soit compté net de son crédit'
