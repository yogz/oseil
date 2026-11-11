// The example speaks of « la personne de l’exemple », never to the visitor as if its figures were
// theirs (Nicolas, 10 November 2026). The site's words say « tu »; here they are turned to the third
// person, the real screens keep theirs. Whole phrases first, where a verb changes with its subject,
// then the possessives and « toi » one word at a time. `third-person.test.ts` holds every sentence
// the example shows; the page tests check that none still says « tu ».

const PHRASES: Array<[RegExp, string]> = [
  [/\bTu possèdes\b/g, 'Cette personne possède'],
  [/\btu dois encore\b/g, 'elle doit encore'],
  [/\bce que tu as mis de côté/g, 'ce qu’elle a mis de côté'],
  [/\bsi tu étais\b/g, 'si elle était'],
  [/\bSi tu étais\b/g, 'Si elle était'],
  [/\bMontre-moi mes objectifs\b/g, 'Voir ses objectifs'],
  [/\bRevenir à mes vrais chiffres\b/g, 'Revenir à ses vrais chiffres'],
  // No \b after « déjà »: « à » is not a word character for \b, so it would never match.
  [/\bCe que tu avais déjà/g, 'Ce qu’elle avait déjà'],
]

// Letters on either side of a word, accents included: « ta » never matches inside « Totale ».
const word = (w: string) => new RegExp(`(?<![\\p{L}’'])${w}(?![\\p{L}’'])`, 'gu')
const WORDS: Array<[RegExp, string]> = [
  [word('ta'), 'sa'],
  [word('Ta'), 'Sa'],
  [word('tes'), 'ses'],
  [word('Tes'), 'Ses'],
  [word('ton'), 'son'],
  [word('Ton'), 'Son'],
  [word('toi'), 'elle'],
]

export function thirdPerson(text: string): string {
  let out = text
  for (const [from, to] of [...PHRASES, ...WORDS]) out = out.replace(from, to)
  return out
}

// Every string of a view, at any depth: views are plain data (strings, numbers, arrays, objects).
export function thirdPersonDeep<T>(value: T): T {
  if (typeof value === 'string') return thirdPerson(value) as T
  if (Array.isArray(value)) return value.map(thirdPersonDeep) as T
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, thirdPersonDeep(v)])) as T
  }
  return value
}
