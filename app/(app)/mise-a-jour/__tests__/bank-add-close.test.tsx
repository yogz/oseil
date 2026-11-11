// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { AddFlow } from '@/components/update/AddFlow'
import { todayIso } from '@/lib/dates'
import { exampleProfile, exampleSnapshot } from '@/lib/model/__tests__/fixtures'
import type { Snapshot, UpdateDraft } from '@/lib/model/types'
import { steps } from '@/lib/setup/first-launch'
import { SAVE_FAILED } from '@/lib/setup/use-first-launch'
import { startDraft } from '@/lib/update/draft'
import { addAccount, putAddedLine } from '@/lib/update/lines'
import type { UpdateState } from '@/lib/update/use-update'
import BankPage from '../banque/page'

// The screen read by every component of the page, held outside React so that the
// page and the bank step see the same one, and both re-render when it changes.
const mocks = vi.hoisted(() => {
  let screen: unknown = null
  const listeners = new Set<() => void>()
  return {
    store: {
      get: () => screen,
      set: (next: unknown) => {
        screen = next
        for (const listener of listeners) listener()
      },
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
    push: vi.fn(),
    replace: vi.fn(),
    // The site's market routes, as the browser calls them: never Yahoo itself.
    requestSearch: vi.fn(),
    requestQuotes: vi.fn(),
    requestRates: vi.fn(),
  }
})

vi.mock('@/components/update/UpdateProvider', async () => {
  const { useSyncExternalStore } = await import('react')
  return { useUpdateScreen: () => useSyncExternalStore(mocks.store.subscribe, mocks.store.get) }
})
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }))
vi.mock('@/lib/market/client', () => ({
  requestSearch: mocks.requestSearch,
  requestQuotes: mocks.requestQuotes,
  requestRates: mocks.requestRates,
}))
vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props} />
  ),
}))

// What the test holds: the draft, as the real hook keeps it after each change; a write
// that fails keeps the change on screen, unsaved (F1).
type World = {
  draft: UpdateDraft
  base: Snapshot
  current: string | null
  fail: boolean
  saveError: string | null
  settled: () => Promise<boolean>
  calls: string[]
}
let world: World

function publish() {
  const state: UpdateState = {
    status: 'ready',
    session: {
      profile: exampleProfile,
      base: { id: 's1', value: world.base, updatedAt: '' },
      draft: world.draft,
      market: { prices: {}, rates: null },
      failedPrices: [],
      retryMarket: () => {},
      saved: true,
      change: async (f) => {
        world.calls.push('change')
        world.draft = f(world.draft)
        world.saveError = world.fail ? SAVE_FAILED : null
        publish()
        return !world.fail
      },
      resave: async () => {
        world.calls.push('resave')
        world.saveError = world.fail ? SAVE_FAILED : null
        publish()
        return !world.fail
      },
      save: async () => true,
      abandon: async () => true,
      settled: () => {
        world.calls.push('settled')
        return world.settled()
      },
      saveError: world.saveError,
    },
  }
  mocks.store.set({
    state,
    current: steps(exampleProfile).find((e) => e.id === world.current) ?? null,
    show: (id: string) => {
      world.current = id
      publish()
    },
  })
}

beforeEach(() => {
  mocks.push.mockReset()
  mocks.replace.mockReset()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  world = {
    draft: startDraft('s1'),
    base: exampleSnapshot,
    current: 'boursobank',
    fail: false,
    saveError: null,
    settled: async () => true,
    calls: [],
  }
  publish()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// formatEuros writes its spaces as no-break spaces.
const norm = (s: string) => s.replace(/[  ]/g, ' ')
const region = (name: string) => screen.getByRole('region', { name })
const heading = () => screen.getByRole('heading', { level: 1 })


const ask = 'Ouvert depuis la dernière fois, ou tu l’avais déjà ?'

async function addLep(answer: string) {
  await userEvent.click(screen.getByRole('button', { name: '+ Ajouter un compte' }))
  await userEvent.click(screen.getByRole('button', { name: /^LEP/ }))
  expect(screen.getByText(ask)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: answer }))
  await userEvent.type(screen.getByLabelText('Combien y a-t-il dessus ?'), '2000')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
}

test('« + Ajouter un compte » a LEP opened since: the account, its arrival and its value, then a row « nouveau »', async () => {
  render(<BankPage />)
  await addLep('Ouvert depuis la dernière fois')
  const [account] = world.draft.added.accounts
  expect(account).toMatchObject({ type: 'lep', establishmentId: 'boursobank' })
  const [line] = world.draft.added.lines
  expect(world.draft.arrivals).toEqual({ [account.id]: 'opened' })
  expect(world.draft.values).toEqual([{ lineId: line.id, kind: 'amount', amount: 200_000, seenOn: expect.any(String) }])
  expect(heading()).toHaveTextContent('BoursoBank')
  expect(screen.getByRole('button', { name: (n) => norm(n) === 'LEP · 2 000 € · nouveau' })).toBeInTheDocument()
  expect(screen.getByText('1 ligne sur 4 vérifiée')).toBeInTheDocument()
})

test('« Je l’avais déjà » gives the arrival existing', async () => {
  render(<BankPage />)
  await addLep('Je l’avais déjà')
  const [account] = world.draft.added.accounts
  expect(world.draft.arrivals).toEqual({ [account.id]: 'existing' })
})

test('an added line reopens with « Enregistrer », and « Supprimer » takes it out with its value and arrival', async () => {
  render(<BankPage />)
  await addLep('Ouvert depuis la dernière fois')
  await userEvent.click(screen.getByRole('button', { name: /nouveau$/ }))
  const box = screen.getByLabelText('Combien y a-t-il dessus ?')
  await userEvent.clear(box)
  await userEvent.type(box, '2500')
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(world.draft.values[0]).toMatchObject({ amount: 250_000 })
  await userEvent.click(screen.getByRole('button', { name: /nouveau$/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
  expect(world.draft.added.lines).toEqual([])
  expect(world.draft.values).toEqual([])
  // The account keeps its arrival but has no line left: the snapshot build drops it.
  expect(world.draft.arrivals).toEqual({ [world.draft.added.accounts[0].id]: 'opened' })
  expect(screen.queryByRole('button', { name: /nouveau$/ })).not.toBeInTheDocument()
  expect(screen.getByText('0 ligne sur 3 vérifiée')).toBeInTheDocument()
})

test('a new PEA: the question once, its name, then a units line that asks nothing more', async () => {
  render(<BankPage />)
  await userEvent.click(screen.getByRole('button', { name: '+ Ajouter un compte' }))
  await userEvent.click(screen.getByRole('button', { name: /^PEA/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Je l’avais déjà' }))
  await userEvent.clear(screen.getByLabelText('Son nom'))
  await userEvent.type(screen.getByLabelText('Son nom'), 'PEA-PME')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  const [account] = world.draft.added.accounts
  expect(account).toMatchObject({ type: 'pea', name: 'PEA-PME' })
  expect(world.draft.arrivals).toEqual({ [account.id]: 'existing' })

  await userEvent.click(screen.getByRole('button', { name: '+ Une action ou un fonds' }))
  expect(screen.queryByText(ask)).not.toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Son nom'), 'World')
  await userEvent.type(screen.getByLabelText('Combien de parts as-tu ?'), '10')
  await userEvent.type(screen.getByLabelText('Combien vaut une part aujourd’hui ?'), '100')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  const [line] = world.draft.added.lines
  expect(line).toMatchObject({ accountId: account.id, kind: 'units' })
  // The account’s answer holds: the line has none of its own.
  expect(Object.keys(world.draft.arrivals)).toEqual([account.id])
  await userEvent.click(screen.getByRole('button', { name: 'Terminé' }))
  expect(screen.getByRole('button', { name: (n) => norm(n) === 'World · 1 000 € · nouveau' })).toBeInTheDocument()
})

// Decision 5 (final wave F2): a share added during the update is attached to its price there,
// by a search on its ISIN; the box takes today's price in the line's currency.
describe('« + Ajouter » attaches a share to its price', () => {
  const RATES = { on: '2026-11-06', perEuro: { USD: 1.1165, GBP: 0.83415, CHF: 0.9143 } }
  beforeEach(() => {
    mocks.requestSearch.mockReset()
    mocks.requestQuotes.mockReset()
    mocks.requestRates.mockReset().mockResolvedValue(RATES)
  })

  async function addToNewPea(isin: string, pick: RegExp) {
    render(<BankPage />)
    await userEvent.click(screen.getByRole('button', { name: '+ Ajouter un compte' }))
    await userEvent.click(screen.getByRole('button', { name: /^PEA/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Je l’avais déjà' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
    await userEvent.click(screen.getByRole('button', { name: '+ Une action ou un fonds' }))
    await userEvent.click(screen.getByRole('button', { name: 'Suivre son prix automatiquement' }))
    await userEvent.type(screen.getByLabelText('Son nom ou son code ISIN'), isin)
    await userEvent.click(screen.getByRole('button', { name: 'Chercher' }))
    await userEvent.click(await screen.findByRole('button', { name: pick }))
    return screen.findByLabelText('Combien vaut une part aujourd’hui ?')
  }

  test('Air Liquide found by FR0000120073: its price in the box, and the added line on AI.PA, in euros', async () => {
    mocks.requestSearch.mockResolvedValue([{ symbol: 'AI.PA', name: 'Air Liquide', exchange: 'Paris', kind: 'action' }])
    mocks.requestQuotes.mockResolvedValue({ 'AI.PA': { price: 171.08, currency: 'EUR', asOf: todayIso() } })
    const box = await addToNewPea('FR0000120073', /Air Liquide/)
    expect(box).toHaveValue('171,08')
    expect(mocks.requestSearch).toHaveBeenCalledWith('FR0000120073')
    expect(mocks.requestQuotes).toHaveBeenCalledWith(['AI.PA'])
    await userEvent.type(screen.getByLabelText('Combien de parts as-tu ?'), '10')
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
    const [line] = world.draft.added.lines
    expect(line).toMatchObject({ name: 'Air Liquide', kind: 'units', quoteSymbol: 'AI.PA', currency: 'EUR' })
    expect(world.draft.values).toEqual([
      { lineId: line.id, kind: 'units', units: 10, unitPrice: 171.08, averagePrice: null, seenOn: expect.any(String) },
    ])
  })

  test('a share listed in dollars: the box shows its price converted into the PEA’s euros', async () => {
    mocks.requestSearch.mockResolvedValue([{ symbol: 'AAPL', name: 'Apple', exchange: 'NASDAQ', kind: 'action' }])
    mocks.requestQuotes.mockResolvedValue({ AAPL: { price: 270, currency: 'USD', asOf: todayIso() } })
    // 270 $ ÷ 1,1165 = 241,8271 €.
    expect(await addToNewPea('US0378331005', /Apple/)).toHaveValue('241,8271')
    await userEvent.type(screen.getByLabelText('Combien de parts as-tu ?'), '2')
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(world.draft.added.lines[0]).toMatchObject({ quoteSymbol: 'AAPL', currency: 'EUR' })
    expect(world.draft.values[0]).toMatchObject({ unitPrice: 241.8271 })
  })
})

test('« + Une action ou un fonds » under the existing PEA asks the question for that line', async () => {
  render(<BankPage />)
  await userEvent.click(screen.getByRole('button', { name: '+ Une action ou un fonds' }))
  await userEvent.click(screen.getByRole('button', { name: 'Ouvert depuis la dernière fois' }))
  await userEvent.type(screen.getByLabelText('Son nom'), 'World')
  await userEvent.type(screen.getByLabelText('Combien de parts as-tu ?'), '10')
  await userEvent.type(screen.getByLabelText('Combien vaut une part aujourd’hui ?'), '100')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  const [line] = world.draft.added.lines
  expect(line).toMatchObject({ accountId: 'pea', kind: 'units' })
  expect(world.draft.added.accounts).toEqual([])
  expect(world.draft.arrivals).toEqual({ [line.id]: 'opened' })
})

// F9: the draft cannot change what an added loan finances, so editing it never offers the choice.
async function addLoan() {
  await userEvent.click(screen.getByRole('button', { name: '+ Ajouter un compte' }))
  await userEvent.click(screen.getByRole('button', { name: /^Crédit/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Ouvert depuis la dernière fois' }))
  await userEvent.type(screen.getByLabelText('Combien reste-t-il à rembourser ?'), '15000')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
}

test('an added loan, reopened: no choice of what it finances, which it keeps, and nothing forced', async () => {
  render(<BankPage />)
  await addLoan()
  const [loan] = world.draft.added.accounts
  // The only home is what a new loan finances, unless told otherwise.
  expect(loan).toMatchObject({ type: 'loan', financedLineId: 'house-line' })

  await userEvent.click(screen.getByRole('button', { name: /nouveau$/ }))
  expect(screen.queryByText('Ce crédit finance :')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Autre chose (voiture, études…)' })).not.toBeInTheDocument()
  const box = screen.getByLabelText('Combien reste-t-il à rembourser ?')
  await userEvent.clear(box)
  await userEvent.type(box, '14000')
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(screen.queryByText('Choisis ce que finance ce crédit.')).not.toBeInTheDocument()
  expect(heading()).toHaveTextContent('BoursoBank')
  expect(world.draft.values).toEqual([expect.objectContaining({ amount: 1_400_000 })])
  expect(world.draft.added.accounts).toEqual([expect.objectContaining({ id: loan.id, financedLineId: 'house-line' })])
})

test('an added loan for « Autre chose », reopened: it stays so', async () => {
  render(<BankPage />)
  await userEvent.click(screen.getByRole('button', { name: '+ Ajouter un compte' }))
  await userEvent.click(screen.getByRole('button', { name: /^Crédit/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Ouvert depuis la dernière fois' }))
  await userEvent.type(screen.getByLabelText('Combien reste-t-il à rembourser ?'), '8000')
  await userEvent.click(screen.getByRole('button', { name: 'Autre chose (voiture, études…)' }))
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(world.draft.added.accounts[0].financedLineId).toBeUndefined()

  await userEvent.click(screen.getByRole('button', { name: /nouveau$/ }))
  expect(screen.queryByText('Ce crédit finance :')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(heading()).toHaveTextContent('BoursoBank')
  expect(world.draft.added.accounts[0].financedLineId).toBeUndefined()
})

const CLOSE_LINK = 'Une ligne fermée ou vendue\u00A0?'
const CHOOSE = 'Quelle ligne est fermée ou vendue\u00A0?'

// One quiet link at the bottom of the bank: it asks which line, then asks to confirm.
async function closeThroughLink(name: string) {
  await userEvent.click(screen.getByRole('button', { name: CLOSE_LINK }))
  await userEvent.click(within(screen.getByRole('heading', { name: CHOOSE }).parentElement!).getByRole('button', { name }))
}

test('« Une ligne fermée ou vendue ? » chooses the line, asks first, then closes it; « Annuler » reopens it', async () => {
  world.current = 'home'
  publish()
  render(<BankPage />)
  await closeThroughLink('Or')
  expect(world.draft.closed).toEqual([])
  await userEvent.click(screen.getByRole('button', { name: 'Garder la ligne' }))
  expect(world.draft.closed).toEqual([])
  await closeThroughLink('Or')
  await userEvent.click(screen.getByRole('button', { name: 'Oui, la fermer' }))
  expect(world.draft.closed).toEqual(['gold-line'])
  expect(screen.getByText('Or · fermé')).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Or' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
  expect(world.draft.closed).toEqual([])
  expect(region('Or')).toBeInTheDocument()
})

test('no link under each line: a single one for the bank, which can be given up with « Annuler »', async () => {
  world.current = 'home'
  publish()
  render(<BankPage />)
  for (const name of ['Crédit', 'Maison', 'Or']) {
    expect(within(region(name)).queryByRole('button', { name: /vendu|fermé|Remboursé/i })).not.toBeInTheDocument()
  }
  expect(screen.getAllByRole('button', { name: CLOSE_LINK })).toHaveLength(1)
  await userEvent.click(screen.getByRole('button', { name: CLOSE_LINK }))
  const choices = screen.getByRole('heading', { name: CHOOSE }).parentElement!
  expect(within(choices).getAllByRole('button').map((b) => b.textContent)).toEqual(
    expect.arrayContaining([expect.stringContaining('Maison'), expect.stringContaining('Crédit'), expect.stringContaining('Or'), 'Annuler']),
  )
  await userEvent.click(within(choices).getByRole('button', { name: 'Annuler' }))
  expect(screen.getByRole('button', { name: CLOSE_LINK })).toBeInTheDocument()
  expect(world.draft.closed).toEqual([])
})

// Review Focus 4: a line added in pounds while no rate is known. Its value is never 0, and
// never an error while the screen draws: it is written in pounds, as its bank shows it.
describe('a line added in another currency', () => {
  const bank = exampleProfile.establishments.find((e) => e.id === 'boursobank')!
  function inPounds() {
    const pea = addAccount(exampleProfile, startDraft('s1'), {
      establishmentId: 'boursobank',
      type: 'pea',
      name: 'PEA UK',
      arrival: 'existing',
    })
    const line = putAddedLine(
      exampleProfile,
      pea.draft,
      {
        accountId: pea.accountId,
        name: 'Fonds UK',
        entry: { kind: 'units', units: 10, unitPrice: 5, averagePrice: null },
        currency: 'GBP',
      },
      '2026-11-07',
    )
    return { draft: line.draft, accountId: pea.accountId }
  }
  const named = (text: string) => screen.getByRole('button', { name: (n) => norm(n) === text })
  const flow = () => {
    const { draft, accountId } = inPounds()
    render(
      <AddFlow
        profile={exampleProfile}
        draft={draft}
        establishment={bank}
        accountId={accountId}
        saveError={null}
        change={async () => true}
        onDone={() => {}}
      />,
    )
  }

  test('no rate: the bank’s row says the value in pounds (10 × 5 £)', () => {
    world.draft = inPounds().draft
    publish()
    render(<BankPage />)
    expect(named('Fonds UK · 50 £GB · nouveau')).toBeInTheDocument()
  })

  test('no rate: the list of the added account says it too, and draws', () => {
    flow()
    expect(named('Fonds UK · 50 £GB')).toBeInTheDocument()
  })

  test('with the base snapshot’s rate: still in pounds, never converted on this screen', () => {
    world.draft = inPounds().draft
    world.base = { ...exampleSnapshot, fx: { GBP: 1.2 } }
    publish()
    render(<BankPage />)
    expect(named('Fonds UK · 50 £GB · nouveau')).toBeInTheDocument()
  })
})

test('closing an added line removes it', async () => {
  render(<BankPage />)
  await addLep('Ouvert depuis la dernière fois')
  // An added row offers « Supprimer »: only the lines of the base are offered to be closed.
  await userEvent.click(screen.getByRole('button', { name: CLOSE_LINK }))
  const choices = screen.getByRole('heading', { name: CHOOSE }).parentElement!
  expect(within(choices).getAllByRole('button').filter((b) => b.textContent !== 'Annuler')).toHaveLength(3)
  // And closing an added line, whatever the way, removes it with its value and its arrival (decision 4).
  const { closeLine } = await import('@/lib/update/lines')
  const closed = closeLine(world.draft, world.draft.added.lines[0].id)
  expect(closed.added.lines).toEqual([])
  expect(closed.values).toEqual([])
  expect(closed.closed).toEqual([])
})
