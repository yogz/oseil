// Writes a sample workbook (invented figures) so the look can be judged.
// Usage: npx tsx scripts/sample-workbook.ts <path>
// The real column list belongs to lib/transfer (a later task); this one is
// only for the look.
import { writeFile } from 'node:fs/promises'
import { writeWorkbook, type Cell, type SheetSpec } from '../lib/transfer/xlsx'

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day))

const comptes: SheetSpec = {
  name: 'Comptes',
  columns: [
    { title: 'Banque', format: 'text', width: 18 },
    { title: 'Compte', format: 'text', width: 22 },
    { title: 'Ligne', format: 'text', width: 22 },
    { title: 'Type de compte', format: 'text', width: 18 },
    { title: 'Catégorie', format: 'text', width: 20 },
    { title: 'Chapitre', format: 'text', width: 16 },
    { title: 'Façon de compter', format: 'text', width: 18 },
    { title: 'Devise', format: 'text', width: 9 },
    { title: 'Symbole suivi', format: 'text', width: 14 },
    { title: 'Débloqué le', format: 'date', width: 13 },
    { title: 'Long à récupérer', format: 'text', width: 16 },
    { title: 'Logement financé', format: 'text', width: 18 },
    { title: 'Fermée le', format: 'date', width: 13 },
    { title: 'Identifiant (laisser vide)', format: 'text', width: 16, quiet: true },
    { title: 'Identifiant du compte (laisser vide)', format: 'text', width: 20, quiet: true },
  ],
  rows: [
    ['Banque Exemple', 'Compte courant', 'Compte courant', 'Compte courant', 'Argent disponible', 'Liquidités', 'Montant', 'EUR', null, null, 'non', null, null, null, null],
    ['Banque Exemple', 'Livret A', 'Livret A', 'Livret', 'Épargne sécurisée', 'Épargne', 'Montant', 'EUR', null, null, 'non', null, null, null, null],
    ['Courtier Exemple', 'PEA', 'Fonds monde', 'PEA', 'Placements en bourse', 'Bourse', 'Parts', 'EUR', 'CW8.PA', d(2029, 6, 1), 'non', null, null, null, null],
    ['Courtier Exemple', 'Compte-titres', 'Action US', 'Compte-titres', 'Placements en bourse', 'Bourse', 'Parts', 'USD', 'AAPL', null, 'non', null, null, null, null],
    ['Chez toi', 'Résidence principale', 'Appartement', 'Immobilier', 'Immobilier', 'Chez toi', 'Montant', 'EUR', null, null, 'oui', null, null, null, null],
    ['Chez toi', 'Résidence principale', 'Crédit immobilier', 'Crédit', 'Immobilier', 'Chez toi', 'Montant', 'EUR', null, null, 'non', 'Appartement', null, null, null],
  ],
}

const releves: SheetSpec = {
  name: 'Relevés',
  columns: [
    { title: 'Date du relevé', format: 'date', width: 15 },
    { title: 'N° du relevé', format: 'integer', width: 12 },
    { title: 'Banque', format: 'text', width: 18 },
    { title: 'Compte', format: 'text', width: 22 },
    { title: 'Ligne', format: 'text', width: 22 },
    { title: 'Valeur en euros (calculé)', format: 'euros', width: 18 },
    { title: 'Montant', format: 'euros', width: 16 },
    { title: 'Devise (calculé)', format: 'text', width: 11 },
    { title: 'Parts', format: 'number', width: 11 },
    { title: 'Prix d’une part', format: 'euros', width: 14 },
    { title: 'Prix moyen d’achat', format: 'euros', width: 16 },
    { title: 'Chiffre vu le (si plus ancien)', format: 'date', width: 18 },
    { title: 'Ouverte avec de l’argent neuf', format: 'text', width: 18 },
    { title: 'Taux de change', format: 'number', width: 12 },
    { title: 'Identifiant (laisser vide)', format: 'text', width: 16, quiet: true },
  ],
  rows: ([
    [d(2026, 8, 31), 1, 'Banque Exemple', 'Compte courant', 'Compte courant', 2400.5, 2400.5, 'EUR', null, null, null, null, null, null, null],
    [d(2026, 8, 31), 1, 'Courtier Exemple', 'PEA', 'Fonds monde', 11250, null, 'EUR', 90, 125, 110.5, null, null, null, null],
    [d(2026, 8, 31), 1, 'Courtier Exemple', 'Compte-titres', 'Action US', 1840.9, null, 'USD', 10, 195, 150, null, null, 0.9441, null],
    [d(2026, 8, 31), 1, 'Chez toi', 'Résidence principale', 'Appartement', 320000, 320000, 'EUR', null, null, null, null, null, null, null],
    [d(2026, 8, 31), 1, 'Chez toi', 'Résidence principale', 'Crédit immobilier', -212000, -212000, 'EUR', null, null, null, null, null, null, null],
    [d(2026, 9, 30), 2, 'Banque Exemple', 'Compte courant', 'Compte courant', 2650, 2650, 'EUR', null, null, null, null, null, null, null],
    [d(2026, 9, 30), 2, 'Courtier Exemple', 'PEA', 'Fonds monde', 11660, null, 'EUR', 92, 126.74, 110.5, null, 'non', null, null],
    [d(2026, 9, 30), 2, 'Chez toi', 'Résidence principale', 'Crédit immobilier', -211000, -211000, 'EUR', null, null, null, null, null, null, null],
    [d(2026, 10, 31), 3, 'Banque Exemple', 'Livret A', 'Livret A', 12000, 12000, 'EUR', null, null, null, d(2026, 10, 15), null, null, null],
    [d(2026, 10, 31), 3, 'Courtier Exemple', 'PEA', 'Fonds monde', 12036.4, null, 'EUR', 94, 128.05, 111.2, null, 'oui', null, null],
    [d(2026, 10, 31), 3, 'Chez toi', 'Résidence principale', 'Crédit immobilier', -210000, -210000, 'EUR', null, null, null, null, null, null, null],
  ] as Cell[][]),
}

const versements: SheetSpec = {
  name: 'Versements',
  columns: [
    { title: 'Date du relevé', format: 'date', width: 15 },
    { title: 'N° du relevé', format: 'integer', width: 12 },
    { title: 'Banque', format: 'text', width: 18 },
    { title: 'Compte', format: 'text', width: 22 },
    { title: 'Versé', format: 'euros', width: 14 },
    { title: 'Identifiant du compte (laisser vide)', format: 'text', width: 20, quiet: true },
  ],
  rows: [
    [d(2026, 9, 30), 2, 'Courtier Exemple', 'PEA', 300, null],
    [d(2026, 10, 31), 3, 'Courtier Exemple', 'PEA', 200, null],
  ],
}

const objectifs: SheetSpec = {
  name: 'Objectifs',
  columns: [
    { title: 'À partir du', format: 'date', width: 14 },
    { title: 'Argent disponible (%)', format: 'integer', width: 20 },
    { title: 'Épargne sécurisée (%)', format: 'integer', width: 20 },
    { title: 'Placements en bourse (%)', format: 'integer', width: 22 },
    { title: 'Or et crypto (%)', format: 'integer', width: 16 },
  ],
  rows: [[d(2026, 8, 1), 10, 30, 55, 5]],
}

const reglages: SheetSpec = {
  name: 'Réglages',
  columns: [
    { title: 'Réglage', format: 'text', width: 28 },
    { title: 'Valeur', format: 'text', width: 24 },
  ],
  rows: [
    ['Montants masqués', 'non'],
    ['Devise d’affichage', 'EUR'],
  ],
}

const modeEmploi: SheetSpec = {
  name: 'Mode d’emploi',
  columns: [],
  rows: [],
  note: [
    'Mode d’emploi',
    'Ce fichier contient tes chiffres en clair. Garde-le en lieu sûr.',
    'Texte provisoire : le vrai mode d’emploi viendra plus tard.',
  ],
}

const pourUneIa: SheetSpec = {
  name: 'Pour une IA',
  columns: [],
  rows: [],
  note: [
    'Pour une IA',
    'Copie le contenu de cet onglet dans la conversation avec ton assistant.',
    'Texte provisoire : les consignes complètes viendront plus tard.',
  ],
}

async function main() {
  const path = process.argv[2]
  if (!path) throw new Error('Usage: npx tsx scripts/sample-workbook.ts <path>')
  const blob = await writeWorkbook([
    comptes,
    releves,
    versements,
    objectifs,
    reglages,
    modeEmploi,
    pourUneIa,
  ])
  await writeFile(path, Buffer.from(await blob.arrayBuffer()))
  console.log(`Écrit : ${path}`)
}

main()
