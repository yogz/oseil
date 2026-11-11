import { describe, test, expect, it } from 'vitest'
import { ACCOUNT_TYPES, BANKS, CATEGORIES, CURRENCIES, GROUP_LABELS, OTHER_BANKS, RESIDENCE_LABELS } from '@/lib/catalog'
import { COLUMNS, EXAMPLE_BANK, HOME_NAME, KIND_NAMES, SETTING_NAMES, SHEETS } from '../format'
import { TEMPLATE_FILE_NAME, exportFileName, exportSheets, templateSheets } from '../export'
import { AI_EXAMPLE, AI_PROMPT, aiNote, guideNote } from '../instructions'
import { readWorkbook, writeWorkbook, type Cell, type SheetSpec } from '../xlsx'
import { fixtureInput } from './fixtures'
import { canHold } from '@/lib/correct/profile-changes'

const NONE = { profile: 0, snapshots: 0, goals: 0, settings: 0 }
// The notes hold no-break spaces (French typography); the expectations are written with plain ones.
const read = (note: string[]) => note.join('\n').replace(/ /g, ' ')

const sheet = (sheets: SheetSpec[], name: string) => {
  const found = sheets.find((s) => s.name === name)
  if (!found) throw new Error(`no sheet ${name}`)
  return found
}

type Kind = keyof typeof COLUMNS
const at = (kind: Kind, key: string) => {
  const index = COLUMNS[kind].findIndex((column) => column.key === key)
  if (index < 0) throw new Error(`no column ${key}`)
  return index
}
const cell = (row: Cell[], kind: Kind, key: string) => row[at(kind, key)]
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

const sheets = exportSheets(fixtureInput())
const accounts = sheet(sheets, SHEETS.accounts)
const snapshots = sheet(sheets, SHEETS.snapshots)
const contributions = sheet(sheets, SHEETS.contributions)

const accountRow = (lineId: string) => accounts.rows.find((row) => cell(row, 'accounts', 'reference') === lineId)!
const snapshotRows = (lineId: string) => snapshots.rows.filter((row) => cell(row, 'snapshots', 'reference') === lineId)

describe('exportSheets', () => {
  it('writes the seven sheets in the order of the revisions', () => {
    expect(sheets.map((s) => s.name)).toEqual([
      SHEETS.accounts,
      SHEETS.snapshots,
      SHEETS.contributions,
      SHEETS.goals,
      SHEETS.settings,
      SHEETS.guide,
      SHEETS.ai,
    ])
  })

  it('shows « € » only on the euro value, not on figures in the line’s currency', () => {
    const format = (key: string) => snapshots.columns[at('snapshots', key)].format
    expect(format('euroValue')).toBe('euros')
    for (const key of ['amount', 'unitPrice', 'averagePrice']) expect(format(key)).toBe('number')
  })

  it('takes every column title from COLUMNS', () => {
    for (const kind of ['accounts', 'snapshots', 'contributions', 'goals', 'settings'] as const) {
      const written = sheet(sheets, SHEETS[kind])
      expect(written.columns.map((c) => c.title)).toEqual(COLUMNS[kind].map((c) => c.title))
      expect(written.rows.every((row) => row.length === COLUMNS[kind].length)).toBe(true)
    }
    expect(accounts.columns.filter((c) => c.quiet).map((c) => c.title)).toEqual([
      'Identifiant (laisser vide)',
      'Identifiant du compte (laisser vide)',
    ])
  })

  it('writes one Comptes row per line, with its account and bank', () => {
    expect(accounts.rows).toHaveLength(11 + 2)
    const fund = accountRow('l-fund')
    expect(cell(fund, 'accounts', 'bank')).toBe('Crédit Agricole')
    expect(cell(fund, 'accounts', 'account')).toBe('Assurance-vie')
    expect(cell(fund, 'accounts', 'type')).toBe(ACCOUNT_TYPES['life-insurance'].label)
    expect(cell(fund, 'accounts', 'kind')).toBe(KIND_NAMES.units)
    expect(cell(fund, 'accounts', 'group')).toBe(GROUP_LABELS.world)
    expect(cell(fund, 'accounts', 'symbol')).toBe('CW8.PA')
    expect(cell(fund, 'accounts', 'unlockOn')).toEqual(day('2027-03-01'))
    expect(cell(fund, 'accounts', 'accountReference')).toBe('a-av')
    // No category of its own: empty, the type's default.
    expect(cell(fund, 'accounts', 'category')).toBeNull()
    expect(cell(accountRow('l-usd'), 'accounts', 'category')).toBe(CATEGORIES.markets.label)
    expect(cell(accountRow('l-usd'), 'accounts', 'currency')).toBe('USD')
    expect(cell(accountRow('l-usd'), 'accounts', 'slow')).toBe('oui')
    expect(cell(fund, 'accounts', 'slow')).toBeNull()
  })

  it('names the home « Chez toi », the financed line by its path, the closing date as is', () => {
    expect(cell(accountRow('l-home'), 'accounts', 'bank')).toBe(HOME_NAME)
    expect(cell(accountRow('l-loan'), 'accounts', 'financedLine')).toBe('Chez toi › Ma maison › Ma maison')
    expect(cell(accountRow('l-home'), 'accounts', 'financedLine')).toBeNull()
    expect(cell(accountRow('l-closed'), 'accounts', 'closedOn')).toEqual(day('2026-10-01'))
    expect(cell(accountRow('l-fund'), 'accounts', 'closedOn')).toBeNull()
  })

  it('keeps an account with no line and a bank with no account, so a backup loses nothing', () => {
    const pea = accounts.rows.find((row) => cell(row, 'accounts', 'accountReference') === 'a-pea')!
    expect(pea).toEqual(
      COLUMNS.accounts.map(
        (column) =>
          ({
            bank: 'BoursoBank',
            account: 'PEA',
            type: ACCOUNT_TYPES.pea.label,
            unlockOn: day('2029-05-01'),
            accountReference: 'a-pea',
          })[column.key as string] ?? null,
      ),
    )
    const fortuneo = accounts.rows.filter((row) => cell(row, 'accounts', 'bank') === 'Fortuneo')
    expect(fortuneo).toEqual([COLUMNS.accounts.map((column) => (column.key === 'bank' ? 'Fortuneo' : null))])
    // In the profile's order: Fortuneo after Crédit Agricole, then the typed bank and the employee savings, before Chez toi.
    const banks = accounts.rows.map((row) => cell(row, 'accounts', 'bank'))
    expect([...new Set(banks)]).toEqual(['BoursoBank', 'Crédit Agricole', 'Fortuneo', 'Banque du coin', 'Épargne salariale', HOME_NAME])
  })

  it('writes the financed line’s identifier when its path would not find it alone', () => {
    const financed = (input: ReturnType<typeof fixtureInput>) => {
      const rows = sheet(exportSheets(input), SHEETS.accounts).rows
      return cell(rows.find((row) => cell(row, 'accounts', 'reference') === 'l-loan')!, 'accounts', 'financedLine')
    }
    const twin = fixtureInput()
    twin.profile.accounts.push({ id: 'a-home2', establishmentId: 'e-home', type: 'home', name: 'ma maison' })
    twin.profile.lines.push({ id: 'l-home2', accountId: 'a-home2', name: 'Ma Maison', kind: 'amount', currency: 'EUR' })
    expect(financed(twin)).toBe('l-home')
    const arrow = fixtureInput()
    arrow.profile.accounts.find((a) => a.id === 'a-home')!.name = 'Maison › Paris'
    expect(financed(arrow)).toBe('l-home')
  })

  it('keeps two accounts of the same name apart by their identifiers', () => {
    const livrets = accounts.rows.filter((row) => cell(row, 'accounts', 'account') === 'Livret')
    expect(livrets.map((row) => cell(row, 'accounts', 'accountReference'))).toEqual(['a-livret1', 'a-livret2'])
  })

  it('numbers the relevés in their order, two on the same day kept apart', () => {
    const numbers = [...new Set(snapshots.rows.map((row) => `${cell(row, 'snapshots', 'number')}`))]
    expect(numbers).toEqual(['1', '2', '3'])
    const sameDay = snapshots.rows.filter((row) => (cell(row, 'snapshots', 'date') as Date).getTime() === day('2026-10-31').getTime())
    expect([...new Set(sameDay.map((row) => cell(row, 'snapshots', 'number')))]).toEqual([2, 3])
    expect(snapshots.rows).toHaveLength(8 + 8 + 8)
  })

  it('writes a relevé with no placement as one row, its date and number only', () => {
    const input = fixtureInput()
    input.snapshots = [...input.snapshots, { schema: 1, takenOn: '2026-11-30', fx: {}, entries: [], contributions: {}, arrivals: {} }]
    const rows = sheet(exportSheets(input), SHEETS.snapshots).rows.filter((row) => cell(row, 'snapshots', 'number') === 4)
    expect(rows).toHaveLength(1)
    expect(cell(rows[0], 'snapshots', 'date')).toEqual(day('2026-11-30'))
    expect(rows[0].filter((value) => value !== null)).toHaveLength(2)
  })

  it('writes a loan in negative, in Montant and in the euro value', () => {
    const [first] = snapshotRows('l-loan')
    expect(cell(first, 'snapshots', 'amount')).toBe(-180000)
    expect(cell(first, 'snapshots', 'euroValue')).toBe(-180000)
    expect(cell(snapshotRows('l-home')[0], 'snapshots', 'amount')).toBe(320000)
  })

  it('writes the rate of a line in another currency, nothing for euros', () => {
    const [usd] = snapshotRows('l-usd')
    expect(cell(usd, 'snapshots', 'fx')).toBe(0.92)
    expect(cell(usd, 'snapshots', 'currencyShown')).toBe('USD')
    expect(cell(usd, 'snapshots', 'units')).toBe(10)
    expect(cell(usd, 'snapshots', 'unitPrice')).toBe(225.5)
    expect(cell(usd, 'snapshots', 'averagePrice')).toBe(180.25)
    expect(cell(usd, 'snapshots', 'amount')).toBeNull()
    // 10 × 225,50 $ = 2 255,00 $, × 0,92 = 2 074,60 €.
    expect(cell(usd, 'snapshots', 'euroValue')).toBe(2074.6)
    expect(cell(snapshotRows('l-usd')[1], 'snapshots', 'fx')).toBe(0.93)
    expect(cell(snapshotRows('l-current')[0], 'snapshots', 'fx')).toBeNull()
    expect(cell(snapshotRows('l-closed')[0], 'snapshots', 'averagePrice')).toBeNull()
  })

  it('writes « Chiffre vu le » only when it differs from the relevé', () => {
    const euro = snapshotRows('l-euro')
    expect(euro.map((row) => cell(row, 'snapshots', 'seenOn'))).toEqual([null, day('2026-10-15'), null])
  })

  it('writes « Ouverte avec de l’argent neuf » from the arrivals of that relevé, empty otherwise', () => {
    expect(snapshotRows('l-livret2').map((row) => cell(row, 'snapshots', 'opened'))).toEqual(['oui', null])
    expect(snapshotRows('l-current').map((row) => cell(row, 'snapshots', 'opened'))).toEqual([null, null, 'non'])
  })

  it('writes one Versements row per non-zero contribution, in euros', () => {
    expect(contributions.rows).toEqual([
      [day('2026-09-30'), 1, 'Crédit Agricole', 'Assurance-vie', 500, 'a-av'],
      [day('2026-10-31'), 2, 'Crédit Agricole', 'Assurance-vie', -200, 'a-av'],
    ])
  })

  it('writes the goals in their order and the settings it holds', () => {
    expect(sheet(sheets, SHEETS.goals).rows).toEqual([
      [day('2026-01-01'), 15, 35, 45, 5, 0, null],
      [day('2026-10-01'), 20, 60, 15, 5, 0, null],
    ])
    expect(sheet(sheets, SHEETS.settings).rows).toEqual([
      [SETTING_NAMES.budget, 3500],
      [SETTING_NAMES.basis, 'salaire'],
      [SETTING_NAMES.display, 'pour cent'],
      [SETTING_NAMES.hidden, 'oui'],
    ])
  })

  it('writes the rental share of a goal in « Immobilier locatif (%) »', () => {
    const input = fixtureInput()
    input.goals = [{ schema: 1, validFrom: '2026-11-01', shares: { available: 10, secured: 30, markets: 25, gold: 5, rental: 30 } }]
    const [goalRow] = sheet(exportSheets(input), SHEETS.goals).rows
    expect(cell(goalRow, 'goals', 'rental')).toBe(30)
    expect(COLUMNS.goals[at('goals', 'rental')].title).toBe('Immobilier locatif (%)')
  })

  it('writes the type of every home, « Résidence principale » when it has none, and nothing on other accounts', () => {
    expect(cell(accountRow('l-home'), 'accounts', 'residence')).toBe(RESIDENCE_LABELS.main)
    for (const lineId of ['l-loan', 'l-fund', 'l-current']) expect(cell(accountRow(lineId), 'accounts', 'residence')).toBeNull()
    const input = fixtureInput()
    input.profile.accounts = input.profile.accounts.map((a) => (a.id === 'a-home' ? { ...a, residence: 'rental' as const } : a))
    // A home with no line yet keeps its type on its own row.
    input.profile.accounts.push({ id: 'a-cabin', establishmentId: 'e-home', type: 'home', name: 'Chalet', residence: 'secondary' })
    const rows = sheet(exportSheets(input), SHEETS.accounts).rows
    expect(cell(rows.find((row) => cell(row, 'accounts', 'reference') === 'l-home')!, 'accounts', 'residence')).toBe(RESIDENCE_LABELS.rental)
    expect(cell(rows.find((row) => cell(row, 'accounts', 'accountReference') === 'a-cabin')!, 'accounts', 'residence')).toBe(
      RESIDENCE_LABELS.secondary,
    )
  })

  it('writes no budget rows without a budget, no settings rows without settings', () => {
    const input = fixtureInput()
    const noBudget = exportSheets({ ...input, settings: { ...input.settings!, budget: null, hideAmounts: false } })
    expect(sheet(noBudget, SHEETS.settings).rows).toEqual([
      [SETTING_NAMES.display, 'pour cent'],
      [SETTING_NAMES.hidden, 'non'],
    ])
    expect(sheet(exportSheets({ ...input, settings: null }), SHEETS.settings).rows).toEqual([])
  })

  it('writes names as text cells, even when they look like numbers', () => {
    const input = fixtureInput()
    input.profile.accounts[0].name = '1234'
    const row = sheet(exportSheets(input), SHEETS.accounts).rows[0]
    expect(cell(row, 'accounts', 'account')).toBe('1234')
    expect(sheet(exportSheets(input), SHEETS.accounts).columns[at('accounts', 'account')].format).toBe('text')
  })

  it('carries the guide and AI notes, the guide saying what is missing', () => {
    const input = { ...fixtureInput(), unreadable: { ...NONE, snapshots: 2 } }
    const guide = read(sheet(exportSheets(input), SHEETS.guide).note!)
    expect(guide).toContain('2 relevés n’ont pas pu être lus : ils manquent dans ce fichier.')
    expect(sheet(sheets, SHEETS.ai).note).toEqual(aiNote())
  })
})

describe('guideNote', () => {
  const plain = read(guideNote(NONE))

  it('says what is unreadable, in honest sentences, and nothing when all is read', () => {
    const text = read(guideNote({ profile: 0, snapshots: 2, goals: 1, settings: 1 }))
    expect(text).toContain('2 relevés n’ont pas pu être lus : ils manquent dans ce fichier.')
    expect(text).toContain('1 objectif n’a pas pu être lu : il manque dans ce fichier.')
    expect(text).toContain('Tes réglages n’ont pas pu être lus : ils manquent dans ce fichier.')
    expect(read(guideNote({ ...NONE, snapshots: 1 }))).toContain('1 relevé n’a pas pu être lu : il manque dans ce fichier.')
    expect(read(guideNote({ ...NONE, profile: 1 }))).toContain('manquent dans ce fichier')
    expect(plain).not.toContain('pas pu être lu')
  })

  it('says what the file is for, that it is in clear, how to import it and from Numbers', () => {
    expect(plain).toContain('conseiller')
    expect(plain).toContain('sauvegarde')
    expect(plain).toContain('en clair')
    expect(plain).toContain('compte neuf')
    expect(plain).toContain('premier lancement')
    expect(plain).toContain('« Importer un fichier ou passer par ton IA »')
    expect(plain).toContain('Partager › Exporter › Excel')
    expect(plain).toContain('Fichier › Exporter vers › Excel')
  })

  it('lists the accepted words', () => {
    for (const type of Object.values(ACCOUNT_TYPES)) expect(plain).toContain(type.label)
    for (const category of Object.values(CATEGORIES)) expect(plain).toContain(category.label)
    for (const label of Object.values(GROUP_LABELS)) expect(plain).toContain(label)
    for (const label of Object.values(RESIDENCE_LABELS)) expect(plain).toContain(label)
    expect(plain).toContain(HOME_NAME)
  })

  it('names the example bank only in the template', () => {
    expect(plain).not.toContain(EXAMPLE_BANK)
    expect(read(guideNote(NONE, { template: true }))).toContain(EXAMPLE_BANK)
  })
})

// The prompt copied from the import screen carries the whole assistant part of « Pour une IA »:
// nothing has to be joined, and the AI asks first for what the person already has
// (Nicolas, 10 November 2026).
// « Chez toi » holds only what the site lets it hold, said where the AI reads the bank column: a
// ChatGPT file put Air Liquide shares held « au nominatif pur » there (Nicolas, 10 November 2026).
describe('the bank column says what « Chez toi » may hold', () => {
  const text = read(aiNote())
  const bankHelp = text.split('\n').find((line) => line.startsWith('- « Banque » ('))!
  const home = { id: '', name: HOME_NAME, kind: 'home' as const }

  it('names exactly the types the site keeps at home', () => {
    for (const [id, type] of Object.entries(ACCOUNT_TYPES)) {
      const named = bankHelp.includes(`« ${type.label} »`)
      if (canHold(home, id as keyof typeof ACCOUNT_TYPES)) expect(named).toBe(true)
    }
    expect(bankHelp).toContain('seulement les comptes « Logement », « Or » ou « Crypto »')
    expect(bankHelp).toContain('tout autre compte se range dans une banque')
  })

  it('sends shares held « au nominatif pur » to a bank named after the company, as a « Compte-titres »', () => {
    expect(bankHelp).toContain('nominatif pur')
    expect(bankHelp).toContain('« Compte-titres »')
  })

  it('tells the person the same in « Mode d’emploi »', () => {
    expect(read(guideNote(NONE))).toContain('Elle ne garde que les comptes « Logement », « Or » ou « Crypto » ; tout le reste se range dans une banque.')
  })
})

// A ChatGPT file made one relevé per document date (one with Air Liquide alone, one with the PER
// alone), left the loans out and misspelt the banks (Nicolas, 10 November 2026).
describe('the prompt keeps a relevé whole, asks for what is forgotten, spells the banks', () => {
  const prompt = AI_PROMPT.replace(/\u00a0/g, ' ')

  it('says a relevé holds every placement, one by default, older figures dated in « Chiffre vu le »', () => {
    expect(prompt).toContain('Un relevé contient tous les placements, jamais une partie.')
    expect(prompt).toContain('avec sa propre date dans « Chiffre vu le (si plus ancien) »')
    expect(prompt).toContain('Ne crée jamais un relevé par document ou par date de document.')
    expect(prompt).toContain('« Relevés » : obligatoire, une ligne par placement et par relevé. Un relevé est la photo de tout le patrimoine à une date')
  })

  it('asks, in the one round of questions, for what people forget', () => {
    for (const word of ['un crédit', 'l’épargne salariale', 'une assurance-vie', 'un PER', 'non cotée', 'une autre banque']) {
      expect(prompt).toContain(word)
    }
  })

  it('lists every bank the site knows, as the import matches them', () => {
    for (const bank of [...BANKS, ...OTHER_BANKS]) expect(prompt).toContain(bank.name)
    expect(prompt).toContain('pas « Credit Agricol »')
  })

  it('never skips the loans, and keeps what has no figure in « Comptes »', () => {
    expect(prompt).toContain('Les crédits ne se sautent pas : sans eux, le patrimoine net est faux, trop haut.')
    expect(prompt).toContain('redemande-le une fois')
    expect(prompt).toContain('va quand même dans « Comptes », sans ligne dans « Relevés »')
    expect(prompt).toContain('Ne le laisse jamais de côté.')
  })

  it('names a placement without its ISIN', () => {
    expect(prompt).toContain('sans son code ISIN')
  })
})

describe('AI_PROMPT', () => {
  const prompt = AI_PROMPT.replace(/\u00a0/g, ' ')
  const assistantPart = aiNote().slice(aiNote().indexOf('# Consignes pour l’assistant'))

  it('holds every line the sheet gives the assistant, so no file has to be joined', () => {
    expect(assistantPart.length).toBeGreaterThan(20)
    for (const line of assistantPart) expect(AI_PROMPT).toContain(line)
  })

  it('leaves out the words meant for the person', () => {
    expect(prompt).not.toContain('Copie tout le texte de cet onglet')
  })

  it('asks first for what the person already has, then the missing pieces once, never line by line', () => {
    const own = prompt.indexOf('ce qu’elle a déjà')
    expect(own).toBeGreaterThan(-1)
    expect(prompt.indexOf('un tableau à elle')).toBeGreaterThan(own)
    expect(prompt).toContain('Ne pose pas les questions ligne par ligne.')
    expect(prompt).toContain('en une seule fois ce qui manque encore')
    expect(prompt).toContain('sinon, crée le fichier de zéro')
  })
})

describe('aiNote', () => {
  const text = read(aiNote())

  it('opens with the sentence for the person and the warning', () => {
    const [first, second] = aiNote()
    expect(first).toContain('ton IA')
    expect(second).toContain('en clair')
  })

  it('never contradicts the import: every word and every title comes from the same constants', () => {
    for (const type of Object.values(ACCOUNT_TYPES)) expect(text).toContain(`« ${type.label} »`)
    for (const category of Object.values(CATEGORIES)) expect(text).toContain(`« ${category.label} »`)
    for (const label of Object.values(GROUP_LABELS)) expect(text).toContain(`« ${label} »`)
    for (const kind of Object.values(KIND_NAMES)) expect(text).toContain(`« ${kind} »`)
    for (const { code } of CURRENCIES) expect(text).toContain(code)
    for (const name of Object.values(SETTING_NAMES)) expect(text).toContain(`« ${name} »`)
    for (const kind of ['accounts', 'snapshots', 'contributions', 'goals', 'settings'] as const) {
      expect(text).toContain(`« ${SHEETS[kind]} »`)
      // The text is read with plain spaces; a title may hold no-break ones (« 1 € = … »).
      for (const column of COLUMNS[kind]) expect(text).toContain(`« ${column.title.replace(/[\u00a0\u202f]/g, ' ')} »`)
    }
  })

  it('says the type of a home and the rental share: their words, a home only, empty or absent', () => {
    for (const label of Object.values(RESIDENCE_LABELS)) expect(text).toContain(`« ${label} »`)
    expect(text).toContain('« Type de logement » (facultatif, texte) : pour un compte « Logement » seulement')
    expect(text).toContain('Vide : « Résidence principale »')
    expect(text).toContain('« Immobilier locatif (%) » (facultatif, nombre entier)')
    expect(text).toContain('Vide, ou colonne absente : 0.')
    // Five shares now, the rental one included: the total counts it.
    expect(text).not.toContain('Les quatre parts')
    expect(text).toContain('Les parts d’une ligne font 100, « Immobilier locatif (%) » compris.')
    expect(text).toContain('« Type de compte », « Type de logement », « Débloqué le »')
  })

  it('states the rules: loan sign, rate direction, invent nothing', () => {
    expect(text).toContain('négatif')
    expect(text).toContain('en euros')
    expect(text).toContain('Ne rien inventer')
    expect(text).toContain('« Ligne » (obligatoire sauf pour un compte encore vide')
    expect(text).toContain('« Compte » (obligatoire sauf pour une banque encore vide')
    expect(text).toContain('Un relevé sans aucun placement s’écrit sur une seule ligne : sa date et son « N° du relevé » (obligatoire ici)')
    expect(text).toContain('Une ligne qui n’a que sa date, sans numéro, est refusée.')
    expect(text.match(/\(obligatoire sauf pour un relevé sans aucun placement/g)).toHaveLength(3)
  })

  it('writes the example in the text as it is in AI_EXAMPLE', () => {
    const names = AI_EXAMPLE.map((s) => s.name)
    expect(names).toEqual([SHEETS.accounts, SHEETS.snapshots])
    const lines = sheet(AI_EXAMPLE, SHEETS.accounts).rows
    expect(lines).toHaveLength(4)
    // A line in dollars, with its rate in « Relevés » (review of 11 November 2026).
    expect(lines.some((row) => cell(row, 'accounts', 'currency') === 'USD')).toBe(true)
    expect(lines.some((row) => cell(row, 'accounts', 'type') === ACCOUNT_TYPES.loan.label)).toBe(true)
    const relevés = sheet(AI_EXAMPLE, SHEETS.snapshots).rows
    expect(new Set(relevés.map((row) => (cell(row, 'snapshots', 'date') as Date).getTime())).size).toBe(2)
    for (const row of relevés) {
      if (cell(row, 'snapshots', 'line') === 'Prêt immobilier') expect(cell(row, 'snapshots', 'amount')).toBeLessThan(0)
    }
    // As Markdown tables, one per sheet, with only the columns the example fills.
    expect(text).toContain('### Onglet « Comptes »')
    expect(text).toContain('| Banque | Compte | Ligne |')
    expect(text).toContain('| -180000 |')
    expect(text).toContain('| 30/09/2026 |')
  })
})

describe('templateSheets', () => {
  const template = templateSheets()

  it('puts the guide first, then the same sheets', () => {
    expect(template.map((s) => s.name)).toEqual([
      SHEETS.guide,
      SHEETS.accounts,
      SHEETS.snapshots,
      SHEETS.contributions,
      SHEETS.goals,
      SHEETS.settings,
      SHEETS.ai,
    ])
  })

  it('has example rows in Comptes, Relevés and Versements, all at the example bank, a loan in negative', () => {
    for (const kind of ['accounts', 'snapshots', 'contributions'] as const) {
      const rows = sheet(template, SHEETS[kind]).rows
      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows) expect(cell(row, kind, 'bank')).toBe(EXAMPLE_BANK)
    }
    const loan = sheet(template, SHEETS.snapshots).rows.find((row) => cell(row, 'snapshots', 'line') === 'Prêt immobilier')!
    expect(cell(loan, 'snapshots', 'amount')).toBeLessThan(0)
    expect(sheet(template, SHEETS.guide).note).toEqual(guideNote(NONE, { template: true }))
  })
})

describe('through the Excel libraries', () => {
  it('writes the export and the template into files that read back', async () => {
    const book = await readWorkbook(await writeWorkbook(sheets))
    expect([...book.keys()]).toEqual(sheets.map((s) => s.name))
    const written = book.get(SHEETS.snapshots)!
    expect(written).toHaveLength(snapshots.rows.length + 1)
    const loan = written.find((row) => row[at('snapshots', 'reference')] === 'l-loan')!
    expect(loan[at('snapshots', 'amount')]).toBe(-180000)
    expect((loan[at('snapshots', 'date')] as Date).toISOString().slice(0, 10)).toBe('2026-09-30')
    const template = await readWorkbook(await writeWorkbook(templateSheets()))
    expect([...template.keys()][0]).toBe(SHEETS.guide)
  })
})

describe('file names', () => {
  it('dates the export, names the template', () => {
    expect(exportFileName('2026-11-09')).toBe('mes-chiffres-2026-11-09.xlsx')
    expect(TEMPLATE_FILE_NAME).toBe('modele-mes-chiffres.xlsx')
  })
})

// docs/superpowers/specs/2026-11-11-coussin-objectif-design.md: the column of months is not a percent.
test('the instructions for an AI tell the months column as months, never as a percent', () => {
  const line = AI_PROMPT.replace(/[\u00a0\u202f]/g, ' ').split('\n').find((l) => l.includes('« Argent disponible (mois) »'))
  expect(line).toBeDefined()
  expect(line).not.toMatch(/en pour cent, un nombre simple/)
  expect(line).toMatch(/mois de dépenses/)
  expect(line).toMatch(/de 1 à 24/)
  expect(line).toMatch(/vaut alors 0/)
})

// Where some investments go (Nicolas, 11 November 2026, after three experts): the right held decides
// the category, the time to get the money back decides « Long à récupérer ».
test('the instructions say where crowdfunding, SCPI and Girardin go', () => {
  const prompt = AI_PROMPT.replace(/[\u00a0\u202f]/g, ' ')
  expect(prompt).toContain('## Où ranger certains placements')
  expect(prompt).toMatch(/Crowdfunding immobilier.*« Placements en bourse ».*« Long à récupérer »/)
  expect(prompt).toMatch(/SCPI.*« Investissement locatif »/)
  expect(prompt).toMatch(/Girardin.*ne l’inscris pas/)
})
