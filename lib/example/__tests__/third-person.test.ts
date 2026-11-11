import { describe, expect, test } from 'vitest'
import { thirdPerson, thirdPersonDeep } from '../third-person'

describe('the example in the third person', () => {
  test.each([
    ['Hors chez toi, en route vers tes objectifs', 'Hors chez elle, en route vers ses objectifs'],
    ['un peu au-dessus de ton objectif', 'un peu au-dessus de son objectif'],
    ['estimée le 31 octobre · pas d’objectif pour chez toi', 'estimée le 31 octobre · pas d’objectif pour chez elle'],
    [
      'Tu possèdes 250 000 €, dont 150 000 € prêtés pour ton logement.',
      'Cette personne possède 250 000 €, dont 150 000 € prêtés pour son logement.',
    ],
    ['Chez toi', 'Chez elle'],
    ['pas d’objectif', 'pas d’objectif'],
    ['Tu possèdes 1 € et tu dois encore 2 €.', 'Cette personne possède 1 € et elle doit encore 2 €.'],
    ['Depuis ton premier relevé', 'Depuis son premier relevé'],
    ['Tes relevés', 'Ses relevés'],
    ['Ta grille : Argent disponible 20 carrés', 'Sa grille : Argent disponible 20 carrés'],
    ['Ce qui est à toi, relevé après relevé', 'Ce qui est à elle, relevé après relevé'],
    ['25,0 % de ce qui est à toi', '25,0 % de ce qui est à elle'],
    ['ce que tu as mis de côté, crédit remboursé compris', 'ce qu’elle a mis de côté, crédit remboursé compris'],
    ['ce que ton argent a rapporté tout seul', 'ce que son argent a rapporté tout seul'],
    ['Ton immobilier réestimé', 'Son immobilier réestimé'],
    ['Ton effort', 'Son effort'],
    ['L’écart se réduit. Au premier relevé…', 'L’écart se réduit. Au premier relevé…'],
    ['Si tu étais pile à tes objectifs', 'Si elle était pile à ses objectifs'],
    ['Simulation : ta grille si tu étais pile à tes objectifs', 'Simulation : sa grille si elle était pile à ses objectifs'],
    ['Simulation · ce n’est pas ta situation', 'Simulation · ce n’est pas sa situation'],
    ['Montre-moi mes objectifs', 'Voir ses objectifs'],
    ['Revenir à mes vrais chiffres', 'Revenir à ses vrais chiffres'],
    ['Or, chez toi', 'Or, chez elle'],
  ])('« %s »', (from, to) => {
    expect(thirdPerson(from)).toBe(to)
  })

  test('leaves words that only hold « ta » or « ton » alone', () => {
    for (const text of ['Totale', 'Compte courant d’exemple', 'Montant', 'Placements en bourse', 'Fonds monde (exemple)']) {
      expect(thirdPerson(text)).toBe(text)
    }
  })

  test('turns every string of a view, at any depth, and nothing else', () => {
    expect(thirdPersonDeep({ a: 'ta maison', b: [{ c: 'tes objectifs', n: 3 }], d: null, e: true })).toEqual({
      a: 'sa maison',
      b: [{ c: 'ses objectifs', n: 3 }],
      d: null,
      e: true,
    })
  })
})
