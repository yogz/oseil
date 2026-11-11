// The words of the Évolution tab. Verbatim from the specs where they give the sentence;
// every other string is builder copy (constructeur): tutoiement, typographic apostrophe.

// Fixed by the design document of lot 5a.
export const COMPARED_TO_FIRST_GOALS = 'comparé à tes premiers objectifs'
// The design document's sentence, « sa hausse » made « sa variation » (builder copy, final
// review): it is said for a drop as well.
export const unknownPaymentsSentence = (account: string) =>
  `Les versements sur ton ${account} ne sont pas connus\u00A0: sa variation est comptée dans les marchés.`
// The same sentence as Mon argent.
export const EVOLUTION_UNREADABLE = 'Une partie de tes chiffres n’a pas pu être lue. Rien n’a été effacé.'

// Builder copy.
export const EVOLUTION_TITLE = 'Évolution'
export const EVOLUTION_LOAD_FAILED = 'Tes chiffres n’ont pas pu être chargés.'
export const EVOLUTION_RETRY = 'Réessayer'
export const EVOLUTION_SINCE_FIRST = 'Depuis ton premier relevé'
export const EVOLUTION_ON_YOURS = 'sur ce qui est à toi'
export const CURVE_TITLE = 'La courbe'
export const CURVE_WAITING = 'La courbe apparaîtra dès qu’elle montrera quelque chose.'
export const EVOLUTION_SINCE_MONTH = (label: string) => `depuis ${label}`
export const CURVE_LABEL = 'Ce qui est à toi, relevé après relevé'
export const GOALS_TITLE = 'Tes objectifs'
export const GOALS_BY_CATEGORY = 'Catégorie par catégorie'
export const GOALS_BY_CATEGORY_SHOW = 'Voir catégorie par catégorie'
export const GOALS_BY_CATEGORY_HIDE = 'Replier catégorie par catégorie'
export const GOALS_LEGEND = 'Un carré pas à sa place, de la couleur de la catégorie qui en a trop.'
export const GOALS_ALL_IN_PLACE = 'Tous les carrés sont à leur place.'
export const COMES_FROM_TITLE = 'D’où ça vient'
export const COMES_FROM_NOTE = 'Depuis ton premier relevé, tout compris.'
export const STATEMENTS_TITLE = 'Tes relevés'
// Planche 4: the grid, from one real snapshot to the next.
export const STEPS_TITLE = 'Ta grille, relevé par relevé'
export const STEPS_PREVIOUS = '‹ Précédent'
export const STEPS_NEXT = 'Suivant ›'
export const STEPS_REPLAY = 'Rejouer depuis le début'
export const STEPS_STOP = 'Arrêter'
export const stepDate = (date: string, latest: boolean) => `Relevé du ${date}${latest ? ' · le dernier' : ''}`
export const stepSquare = (value: string) => `1 carré = ${value}`
export const stepGridLabel = (date: string) => `Ta grille au relevé du ${date}`
export const stepChanged = (n: number) =>
  n === 0
    ? 'Aucun carré ne change de couleur.'
    : n === 1
      ? 'Un carré change de couleur\u00A0; les autres ne bougent pas.'
      : `${n} carrés changent de couleur\u00A0; les autres ne bougent pas.`
export const SINGLE_TITLE = 'Ta courbe commence ici'
export const SINGLE_TEXT = 'Avec un seul relevé, il n’y a pas encore de courbe\u00A0: elle se dessine à chaque mise à jour.'
export const SINGLE_ACTION = 'Mettre à jour maintenant'
export const CURVE_ONE_DAY = 'Tes relevés sont tous du même jour\u00A0: ta courbe se dessinera avec un relevé d’un autre jour.'
export const CURVE_NOT_POSITIVE = 'Ta courbe s’affichera quand ce qui est à toi sera positif.'
export const NONE_TEXT = 'Il n’y a pas encore de relevé\u00A0: ta courbe apparaîtra après le premier.'
export const NO_SQUARE_VALUE = 'pas de carrés'
export const EXISTING_ADDED_ALONG_THE_WAY =
  'des comptes ajoutés en cours de route, ils ne comptent ni dans ton effort ni dans les marchés'

const squares = (n: number) => `${n} ${n > 1 ? 'carrés' : 'carré'}`

export const sinceSquare = (then: string, now: string, firstLabel: string) =>
  `Un carré valait ${then} en ${firstLabel}. Il en vaut ${now} aujourd’hui.`
// B2 (Nicolas, 11 November 2026): the cap told as a total, as every figure of the curve.
export const nextCapLabel = (total: string) => `prochain cap\u00A0: ${total}`
// Said under the curve: what a square will be worth at the cap.
export const nextCapSentence = (total: string, square: string) => `À ${total}, un carré vaudra ${square}.`
export const goalsLead = (first: number, last: number) =>
  last < first
    ? `L’écart se réduit. Au premier relevé, ${squares(first)} n’étaient pas à leur place. Aujourd’hui, ${last}.`
    : last > first
      ? `L’écart grandit. Au premier relevé, ${squares(first)} n’étaient pas à leur place. Aujourd’hui, ${last}.`
      : `Au premier relevé comme aujourd’hui, ${squares(first)} ne sont pas à leur place.`
export const traceLabel = (word: string, targetShare: number) =>
  `${word}, objectif ${Math.round(targetShare)}\u00a0% de ce qui est hors de chez toi`
export const misplacedRowLabel = (count: number) => `${squares(count)} hors de leur place`
export const bubbleLabel = (date: string, net: string, square: string | null) =>
  square === null ? `${date}, ${net}` : `${date}, ${net}, un carré vaut ${square}`
export const unconvertedNote = (date: string, names: string[]) =>
  `Au relevé du ${date}, ${names.join(', ')} n’a pas de taux de change\u00A0: cette ligne n’est pas comptée.`
export const unreadableNote = (date: string) =>
  `Le relevé du ${date} n’a pas pu être lu\u00A0: il n’est pas sur la courbe.`

export const TRACE_WORDS = {
  reached: 'atteint',
  almost: 'presque atteint',
  closer: 'se rapproche',
  further: 's’éloigne',
  steady: 'à peu près stable',
} as const
