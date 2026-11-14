// The words of « Tes titres » as it puts the titles to find first (planche 7C, chosen by Nicolas on
// 12 November 2026). The older words of the page (« Le retrouver », the confirmation) stay in words.ts.

export const TO_FIND_TITLE = 'À retrouver'
export const UNQUOTED = 'Pas coté'
export const CHANGE = 'Changer'
export const SHOW = 'Voir'
export const HIDE = 'Masquer'
export const STILL = 'son prix ne bouge pas tout seul'
export const ALL_IN_ORDER = 'Tous tes titres sont en ordre.'
export const CHANGE_TITLE = 'Changer de titre'

export const toFindLead = (count: number) =>
  count === 1
    ? '1 titre ne suit pas son cours. Retrouve-le, ou dis-nous s’il n’est pas coté.'
    : `${count} titres ne suivent pas leur cours. Retrouve-les, ou dis-nous s’ils ne sont pas cotés.`

export const followedSummary = (count: number) =>
  count === 1 ? '1 titre suit son cours' : `${count} titres suivent leur cours`

export const unquotedSummary = (count: number) =>
  count === 1 ? '1 placement pas coté' : `${count} placements pas cotés`

// A button's name says which line it acts on, as « Le retrouver : ETF » does.
export const about = (action: string, name: string) => `${action} : ${name}`
