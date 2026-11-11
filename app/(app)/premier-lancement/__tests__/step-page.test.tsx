// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { formatEuros } from '@/lib/format'
import { addSingleLineAccount } from '@/lib/setup/step-changes'
import { addAccount, chooseWhere, finishStep, putLine, removeLine, steps, type SetupDraft } from '@/lib/setup/first-launch'
import { UNREADABLE } from '@/lib/setup/use-first-launch'
import StepPage from '../etape/page'
import { plain } from '@/lib/__tests__/plain'

const mocks = vi.hoisted(() => ({
  status: { current: 'ready' as string },
  initial: { current: null as unknown },
  fail: { current: false },
  saveError: { current: null as string | null },
  last: { current: null as unknown },
  apply: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  retry: vi.fn(),
}))

// A stand-in for the real hook: it runs each change on its own draft and keeps the result, as the real one does after a save.
vi.mock('@/lib/setup/use-first-launch', async (original) => {
  const react = await import('react')
  return {
    ...(await original<typeof import('@/lib/setup/use-first-launch')>()),
    useFirstLaunch: () => {
      const [draft, setDraft] = react.useState(mocks.initial.current as SetupDraft | null)
      const ref = react.useRef(draft)
      const apply = react.useCallback(async (change: (d: SetupDraft | null) => SetupDraft) => {
        mocks.apply(change)
        if (mocks.fail.current) return false
        const next = change(ref.current)
        ref.current = next
        mocks.last.current = next
        setDraft(next)
        return true
      }, [])
      return { status: mocks.status.current, draft, apply, saveError: mocks.saveError.current, retry: mocks.retry }
    },
  }
})
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace, push: mocks.push }) }))
vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props} />,
}))

const TODAY = '2026-11-06'

function started(outside: string[] = ['employee-savings']): SetupDraft {
  return chooseWhere(null, { banks: [{ catalogId: 'boursobank', name: 'BoursoBank' }], outside }, TODAY)
}

beforeEach(() => {
  mocks.status.current = 'ready'
  mocks.initial.current = started()
  mocks.fail.current = false
  mocks.saveError.current = null
  mocks.last.current = null
  mocks.apply.mockReset()
  mocks.replace.mockReset()
  mocks.push.mockReset()
  mocks.retry.mockReset()
})
afterEach(cleanup)

const saved = () => mocks.last.current as SetupDraft

// A bank hides its choices behind « + Ajouter un compte »; the step outside the banks shows them.
async function add(typeLabel: RegExp | string) {
  const more = screen.queryByRole('button', { name: '+ Ajouter un compte' })
  if (more) await userEvent.click(more)
  await userEvent.click(screen.getByRole('button', { name: typeLabel }))
}

test('the first bank not finished: position, title, instruction, back link', () => {
  render(<StepPage />)
  expect(screen.getByText('1 sur 2')).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1, name: 'Qu’as-tu chez BoursoBank\u00A0?' })).toBeInTheDocument()
  expect(
    screen.getByText('Ouvre ton application BoursoBank et ajoute ce que tu y vois, ligne par ligne.'),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '‹ Retour' })).toHaveAttribute('href', '/premier-lancement/ou')
})

test('a Livret A at « 10 000 » applies an amount of 1 000 000 cents and is listed', async () => {
  render(<StepPage />)
  await add(/^Livret A/)
  await userEvent.type(screen.getByLabelText('Combien y a-t-il dessus ?'), '10 000')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

  expect(mocks.apply).toHaveBeenCalledOnce()
  expect(saved().snapshot.entries).toEqual([
    expect.objectContaining({ kind: 'amount', amount: 1_000_000, seenOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
  ])
  expect(saved().profile.accounts[0]).toMatchObject({ type: 'livret-a', name: 'Livret A' })
  expect(screen.getByRole('button', { name: `Livret A · ${formatEuros(1_000_000)}` })).toBeInTheDocument()
})

test('an unreadable amount « 12,345 » is refused with a message and nothing is applied', async () => {
  render(<StepPage />)
  await add(/^Livret A/)
  await userEvent.type(screen.getByLabelText('Combien y a-t-il dessus ?'), '12,345')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(screen.getByText('Ce montant n’est pas lisible.')).toBeInTheDocument()
  expect(mocks.apply).not.toHaveBeenCalled()
})

test('a negative amount is refused except on a current account; an empty name is refused', async () => {
  render(<StepPage />)
  await add(/^Livret A/)
  await userEvent.type(screen.getByLabelText('Combien y a-t-il dessus ?'), '-5')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(screen.getByText('Ce montant ne peut pas être négatif.')).toBeInTheDocument()
  await userEvent.clear(screen.getByLabelText('Son nom'))
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(screen.getByText('Donne-lui un nom.')).toBeInTheDocument()
  expect(mocks.apply).not.toHaveBeenCalled()

  await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
  await add(/^Compte courant/)
  await userEvent.type(screen.getByLabelText('Combien y a-t-il dessus ?'), '-250')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(saved().snapshot.entries[0]).toMatchObject({ amount: -25_000 })
})

async function addPeaWithFund(average: string) {
  await add(/^PEA(?!-PME)/)
  // The account first, named after its type, then its lines.
  expect(screen.getByLabelText('Son nom')).toHaveValue('PEA')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  await userEvent.click(screen.getByRole('button', { name: '+ Une action ou un fonds' }))
  await userEvent.type(screen.getByLabelText('Son nom'), 'Amundi MSCI World')
  await userEvent.type(screen.getByLabelText('Combien de parts as-tu ?'), '100')
  if (average) await userEvent.type(screen.getByLabelText('À quel prix les as-tu achetées, en moyenne ?'), average)
  await userEvent.type(screen.getByLabelText('Combien vaut une part aujourd’hui ?'), '250')
}

test('a PEA then a fund of 100 parts at 200 and 250 shows the gain live, then saves a units entry', async () => {
  render(<StepPage />)
  await addPeaWithFund('200')
  expect(screen.getByTestId('units-summary').textContent).toBe(
    `Vaut aujourd’hui ${formatEuros(2_500_000)}, a gagné ${formatEuros(500_000)} depuis l’achat.`,
  )
  expect(screen.getByText(/Rangé dans Placements en bourse/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

  expect(saved().profile.accounts[0]).toMatchObject({ type: 'pea', name: 'PEA' })
  expect(saved().profile.lines[0]).toMatchObject({ name: 'Amundi MSCI World', kind: 'units', category: 'markets' })
  expect(saved().snapshot.entries[0]).toMatchObject({ kind: 'units', units: 100, unitPrice: 250, averagePrice: 200 })
  // Back on the account's lines, then on the step with the line counted.
  expect(screen.getByRole('button', { name: `Amundi MSCI World · ${formatEuros(2_500_000)}` })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '‹ Retour' }))
  expect(screen.getByRole('button', { name: `PEA · 1 action et fonds · ${formatEuros(2_500_000)}` })).toBeInTheDocument()
})

test('an empty average price shows no gain and saves a null average', async () => {
  render(<StepPage />)
  await addPeaWithFund('')
  const summary = screen.getByTestId('units-summary')
  expect(summary.textContent).toBe(`Vaut aujourd’hui ${formatEuros(2_500_000)}.`)
  expect(summary).not.toHaveTextContent('gagné')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(saved().snapshot.entries[0]).toMatchObject({ kind: 'units', averagePrice: null })
})

test('a lower price today than on purchase says « a perdu »', async () => {
  render(<StepPage />)
  await addPeaWithFund('300')
  expect(screen.getByTestId('units-summary').textContent).toBe(
    `Vaut aujourd’hui ${formatEuros(2_500_000)}, a perdu ${formatEuros(500_000)} depuis l’achat.`,
  )
})

test('the summary waits until both numbers read, and an unreadable number gets a message', async () => {
  render(<StepPage />)
  await add(/^Compte-titres/)
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  await userEvent.click(screen.getByRole('button', { name: '+ Une action ou un fonds' }))
  await userEvent.type(screen.getByLabelText('Son nom'), 'Total')
  await userEvent.type(screen.getByLabelText('Combien de parts as-tu ?'), '12')
  expect(screen.queryByTestId('units-summary')).not.toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Combien vaut une part aujourd’hui ?'), '1,2,3')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(screen.getByText('Ce nombre n’est pas lisible.')).toBeInTheDocument()
})

test('« changer » offers the five categories and the choice is saved', async () => {
  render(<StepPage />)
  await addPeaWithFund('')
  await userEvent.click(screen.getByRole('button', { name: /catégorie/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Or et crypto' }))
  expect(screen.getByText(/Rangé dans Or et crypto/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(saved().profile.lines[0]).toMatchObject({ category: 'gold' })
})

test('a PEA offers cash as well, an assurance-vie its euro fund', async () => {
  render(<StepPage />)
  await add(/^PEA(?!-PME)/)
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(screen.getByRole('button', { name: '+ Des espèces' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '+ Des espèces' }))
  await userEvent.type(screen.getByLabelText('Combien y a-t-il dessus ?'), '500')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(saved().snapshot.entries[0]).toMatchObject({ kind: 'amount', amount: 50_000 })
})

test('an assurance-vie offers « + Le fonds euros »; an account left without a line says « montant à saisir », not 0 €', async () => {
  render(<StepPage />)
  await add(/^Assurance-vie/)
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(screen.getByRole('button', { name: '+ Le fonds euros' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '‹ Retour' }))
  expect(screen.getByRole('button', { name: 'Assurance-vie · montant à saisir' })).toBeInTheDocument()
})

test('« Chez toi » comes first; a loan added in BoursoBank is offered, preselects the house and carries financedLineId', async () => {
  const base = started(['my-home'])
  const [home, bourso] = steps(base.profile)
  expect(home.kind).toBe('home')
  let draft = addSingleLineAccount(
    base,
    { establishmentId: home.id, type: 'home', name: 'Ma maison', entry: { kind: 'amount', amount: 30_000_000 } },
    TODAY,
  )
  draft = finishStep(draft, home.id)
  mocks.initial.current = draft
  render(<StepPage />)
  expect(screen.getByRole('heading', { level: 1, name: 'Qu’as-tu chez BoursoBank\u00A0?' })).toBeInTheDocument()
  expect(screen.getByText('2 sur 2')).toBeInTheDocument()
  expect(bourso.name).toBe('BoursoBank')

  await userEvent.click(screen.getByRole('button', { name: '+ Ajouter un compte' }))
  expect(screen.getByRole('heading', { name: 'Crédit, or et crypto' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /^Crédit/ }))
  await userEvent.type(screen.getByLabelText('Combien reste-t-il à rembourser ?'), '180 000')
  expect(screen.getByRole('button', { name: 'Ma maison' })).toHaveAttribute('aria-pressed', 'true')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

  const house = saved().profile.lines.find((l) => l.name === 'Ma maison')!
  const loan = saved().profile.accounts.find((a) => a.type === 'loan')!
  expect(loan.establishmentId).toBe(bourso.id)
  expect(loan.financedLineId).toBe(house.id)
  const loanLine = saved().profile.lines.find((l) => l.accountId === loan.id)!
  expect(loanLine.category).toBeUndefined()
  expect(saved().snapshot.entries.find((e) => e.lineId === loanLine.id)).toMatchObject({ amount: 18_000_000 })

  // « Autre chose » carries no link.
  await add(/^Crédit/)
  await userEvent.type(screen.getByLabelText('Combien reste-t-il à rembourser ?'), '5000')
  await userEvent.click(screen.getByRole('button', { name: 'Autre chose (voiture, études…)' }))
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(saved().profile.accounts.filter((a) => a.type === 'loan')[1].financedLineId).toBeUndefined()
})

test('a loan row says which home it finances, and that it finances none once the house is gone', async () => {
  const base = started(['my-home'])
  const [home, bourso] = steps(base.profile)
  const h = addAccount(base, { establishmentId: home.id, type: 'home', name: 'Maison' })
  const hl = putLine(h.draft, { accountId: h.accountId, name: 'Ma maison', entry: { kind: 'amount', amount: 9 } }, TODAY)
  const l = addAccount(hl.draft, { establishmentId: bourso.id, type: 'loan', name: 'Prêt', financedLineId: hl.lineId })
  const ll = putLine(l.draft, { accountId: l.accountId, name: 'Prêt', entry: { kind: 'amount', amount: 5 } }, TODAY)
  mocks.initial.current = finishStep(ll.draft, home.id)
  const { unmount } = render(<StepPage />)
  expect(screen.getByText('finance Ma maison')).toBeInTheDocument()
  expect(screen.queryByText('ne finance aucun logement')).toBeNull()
  unmount()

  mocks.initial.current = finishStep(removeLine(ll.draft, hl.lineId), home.id)
  render(<StepPage />)
  expect(screen.getByRole('button', { name: /^Prêt/ })).toBeInTheDocument()
  expect(screen.getByText('ne finance aucun logement')).toBeInTheDocument()
})

test('gold and crypto added in a bank use the same forms as in « Chez toi »', async () => {
  render(<StepPage />)
  expect(screen.getByRole('heading', { level: 1, name: 'Qu’as-tu chez BoursoBank\u00A0?' })).toBeInTheDocument()
  await add(/^Or/)
  expect(screen.getByLabelText('Quelle quantité en as-tu ?')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Je ne connais que le montant' }))
  await userEvent.type(screen.getByLabelText('Combien y a-t-il dessus ?'), '2000')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(saved().profile.accounts[0]).toMatchObject({ type: 'gold' })
  expect(saved().profile.lines[0]).toMatchObject({ kind: 'amount' })

  await add(/^Crypto/)
  expect(screen.getByLabelText('Quelle quantité en as-tu ?')).toBeInTheDocument()
})

test('gold uses the units form, and « Je ne connais que le montant » switches to the amount form', async () => {
  mocks.initial.current = started(['gold'])
  render(<StepPage />)
  const options = screen.getAllByRole('button').map((b) => b.textContent)
  expect(options.findIndex((t) => t?.startsWith('Or'))).toBeLessThan(options.findIndex((t) => t?.startsWith('Mon logement')))
  await userEvent.click(screen.getByRole('button', { name: /^Or/ }))
  expect(screen.getByLabelText('Quelle quantité en as-tu ?')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Je ne connais que le montant' }))
  await userEvent.type(screen.getByLabelText('Combien y a-t-il dessus ?'), '2000')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(saved().snapshot.entries[0]).toMatchObject({ kind: 'amount', amount: 200_000 })
  expect(saved().profile.lines[0]).toMatchObject({ kind: 'amount' })
})

test('« Autre compte » asks for a category and refuses to go on without one', async () => {
  render(<StepPage />)
  await add('Je ne trouve pas mon compte')
  await userEvent.type(screen.getByLabelText('Combien y a-t-il dessus ?'), '100')
  await userEvent.type(screen.getByLabelText('Son nom'), 'Mon truc')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(screen.getByText('Choisis une catégorie.')).toBeInTheDocument()
  expect(mocks.apply).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Immobilier' }))
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(saved().profile.lines[0]).toMatchObject({ name: 'Mon truc', category: 'property' })
})

test('employee savings offers only one type and asks for the year it becomes available', async () => {
  const base = chooseWhere(null, { banks: [], outside: ['employee-savings'] }, TODAY)
  mocks.initial.current = base
  render(<StepPage />)
  expect(screen.getByRole('heading', { level: 1, name: 'Qu’as-tu en épargne salariale\u00A0?' })).toBeInTheDocument()
  expect(screen.queryByText(/Ouvre ton application/)).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '+ Ajouter un compte' }))
  expect(screen.getAllByRole('button', { name: /^Épargne salariale/ })).toHaveLength(1)
  expect(screen.queryByRole('button', { name: /^PEA(?!-PME)/ })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /^Épargne salariale/ }))
  await userEvent.type(screen.getByLabelText('Disponible en (année)'), '2031')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(saved().profile.accounts[0]).toMatchObject({ type: 'employee-savings', unlockOn: '2031-01-01' })
})

test('a reopened line can be corrected, or deleted for good', async () => {
  render(<StepPage />)
  await add(/^Livret A/)
  await userEvent.type(screen.getByLabelText('Combien y a-t-il dessus ?'), '10000')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))

  await userEvent.click(screen.getByRole('button', { name: `Livret A · ${formatEuros(1_000_000)}` }))
  const field = screen.getByLabelText('Combien y a-t-il dessus ?')
  expect(field).toHaveValue('10\u202f000')
  await userEvent.clear(field)
  await userEvent.type(field, '12000,50')
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(saved().profile.accounts).toHaveLength(1)
  expect(saved().snapshot.entries[0]).toMatchObject({ amount: 1_200_050 })

  await userEvent.click(screen.getByRole('button', { name: /^Livret A ·/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
  expect(saved().profile.accounts).toEqual([])
  expect(saved().profile.lines).toEqual([])
  expect(saved().snapshot.entries).toEqual([])
  expect(screen.queryByRole('button', { name: /^Livret A ·/ })).not.toBeInTheDocument()
})

test('« J’ai fini » finishes the bank and moves on to the next; once, even if touched twice', async () => {
  render(<StepPage />)
  await userEvent.dblClick(screen.getByRole('button', { name: 'J’ai fini avec BoursoBank' }))
  expect(mocks.apply).toHaveBeenCalledOnce()
  expect(saved().profile.firstLaunch?.finished).toEqual([saved().profile.establishments[0].id])
  expect(screen.getByRole('heading', { level: 1, name: 'Qu’as-tu en épargne salariale\u00A0?' })).toBeInTheDocument()
  expect(screen.getByText('2 sur 2')).toBeInTheDocument()
})

test('nothing left to do goes to the reveal', async () => {
  render(<StepPage />)
  await userEvent.click(screen.getByRole('button', { name: 'J’ai fini avec BoursoBank' }))
  await userEvent.click(screen.getByRole('button', { name: /^J’ai fini/ }))
  expect(mocks.replace).toHaveBeenCalledWith('/premier-lancement/revelation')
})

test('a failed save is shown and the button comes back', async () => {
  mocks.fail.current = true
  mocks.saveError.current = 'Ça n’a pas été enregistré. Vérifie ta connexion et réessaie.'
  render(<StepPage />)
  await userEvent.click(screen.getByRole('button', { name: 'J’ai fini avec BoursoBank' }))
  expect(screen.getByText(/Ça n’a pas été enregistré/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'J’ai fini avec BoursoBank' })).toBeEnabled()
  expect(mocks.replace).not.toHaveBeenCalled()
})

test('Annuler and Retour inside a view go back one view; Retour on the list goes to the choice', async () => {
  render(<StepPage />)
  await userEvent.click(screen.getByRole('button', { name: '+ Ajouter un compte' }))
  expect(screen.getByRole('heading', { level: 1, name: 'Qu’as-tu chez BoursoBank\u00A0?' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Quel type de compte\u00A0?' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '‹ Retour' }))
  expect(screen.queryByRole('heading', { name: 'Quel type de compte\u00A0?' })).not.toBeInTheDocument()
  await add(/^Livret A/)
  expect(screen.getByLabelText('Son nom')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
  expect(screen.queryByLabelText('Son nom')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1, name: 'Qu’as-tu chez BoursoBank\u00A0?' })).toBeInTheDocument()
  expect(mocks.apply).not.toHaveBeenCalled()
})

test('blocked says the unreadable message and writes nothing; failed offers a retry', async () => {
  mocks.status.current = 'blocked'
  const { unmount } = render(<StepPage />)
  expect(screen.getByText(plain(UNREADABLE))).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Ajouter' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
  expect(mocks.retry).toHaveBeenCalledOnce()
  mocks.retry.mockReset()
  unmount()
  mocks.status.current = 'failed'
  render(<StepPage />)
  expect(screen.getByText('Tes chiffres n’ont pas pu être chargés.')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
  expect(mocks.retry).toHaveBeenCalledOnce()
  expect(mocks.apply).not.toHaveBeenCalled()
})

test('rows are rebuilt from a draft that already holds accounts', () => {
  const base = started()
  mocks.initial.current = addSingleLineAccount(
    base,
    { establishmentId: base.profile.establishments[0].id, type: 'livret-a', name: 'Livret A', entry: { kind: 'amount', amount: 1_000_000 } },
    TODAY,
  )
  render(<StepPage />)
  expect(screen.getByRole('button', { name: `Livret A · ${formatEuros(1_000_000)}` })).toBeInTheDocument()
})

async function pea() {
  await add(/^PEA(?!-PME)/)
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  await userEvent.click(screen.getByRole('button', { name: '+ Des espèces' }))
  await userEvent.type(screen.getByLabelText('Combien y a-t-il dessus ?'), '500')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
}

test('deleting the last line of a multi-line account keeps the account; « Supprimer ce compte » removes it', async () => {
  render(<StepPage />)
  await pea()
  await userEvent.click(screen.getByRole('button', { name: /^Espèces ·/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
  expect(saved().profile.lines).toEqual([])
  expect(saved().profile.accounts).toHaveLength(1)
  expect(screen.getByRole('heading', { level: 1, name: 'PEA' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Supprimer ce compte' }))
  expect(saved().profile.accounts).toEqual([])
  expect(screen.getByRole('heading', { level: 1, name: 'Qu’as-tu chez BoursoBank\u00A0?' })).toBeInTheDocument()
})

test('rows of multi-line accounts count their lines', async () => {
  render(<StepPage />)
  await add(/^Assurance-vie/)
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  await userEvent.click(screen.getByRole('button', { name: '+ Le fonds euros' }))
  await userEvent.type(screen.getByLabelText('Combien y a-t-il dessus ?'), '1000')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  await userEvent.click(screen.getByRole('button', { name: '‹ Retour' }))
  expect(screen.getByRole('button', { name: `Assurance-vie · 1 ligne · ${formatEuros(100_000)}` })).toBeInTheDocument()
})

test('a failed save keeps what was typed in the form', async () => {
  mocks.fail.current = true
  mocks.saveError.current = 'Ça n’a pas été enregistré. Vérifie ta connexion et réessaie.'
  render(<StepPage />)
  await add(/^Livret A/)
  await userEvent.type(screen.getByLabelText('Combien y a-t-il dessus ?'), '1234')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(screen.getByText(/Ça n’a pas été enregistré/)).toBeInTheDocument()
  expect(screen.getByLabelText('Combien y a-t-il dessus ?')).toHaveValue('1\u202f234')
  expect(screen.getByRole('button', { name: 'Ajouter' })).toBeEnabled()
})

test('the step outside the banks shows its choices on the step itself, a home explained, then « Autre chose ? »', async () => {
  mocks.initial.current = started(['my-home'])
  render(<StepPage />)
  expect(screen.getByRole('heading', { level: 1, name: 'Qu’as-tu hors des banques\u00A0?' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '+ Ajouter un compte' })).toBeNull()
  expect(screen.queryByRole('heading', { name: /^Autre chose/ })).toBeNull()
  expect(screen.getByRole('button', { name: /^Mon logement/ })).toHaveTextContent('Maison ou appartement, là où tu vis')
  await userEvent.click(screen.getByRole('button', { name: /^Mon logement/ }))
  // Back from the form leads to the step, where the choices are.
  await userEvent.click(screen.getByRole('button', { name: '‹ Retour' }))
  expect(screen.getByRole('heading', { level: 1, name: 'Qu’as-tu hors des banques\u00A0?' })).toBeInTheDocument()
  await add(/^Mon logement/)
  await userEvent.type(screen.getByLabelText('Combien vaut-il, à peu près ?'), '300 000')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(screen.getByRole('button', { name: `Logement · ${formatEuros(30_000_000)}` })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /^Autre chose/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^Un autre logement/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'J’ai tout ajouté' })).toBeInTheDocument()
})

test('a home worth nothing is refused', async () => {
  mocks.initial.current = started(['my-home'])
  render(<StepPage />)
  await add(/^Mon logement/)
  await userEvent.type(screen.getByLabelText('Combien vaut-il, à peu près ?'), '0')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(screen.getByText('Ce montant doit être supérieur à zéro.')).toBeInTheDocument()
  expect(mocks.apply).not.toHaveBeenCalled()
})

test('« Ma maison » asks no type and saves exactly the home it always did: a main residence, written as no mark', async () => {
  mocks.initial.current = started(['my-home'])
  render(<StepPage />)
  await add(/^Mon logement/)
  expect(screen.queryByText(plain('Quel type de logement ?'))).toBeNull()
  expect(screen.queryByRole('button', { name: 'Résidence secondaire' })).toBeNull()
  await userEvent.type(screen.getByLabelText('Combien vaut-il, à peu près ?'), '300 000')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  const home = saved().profile.establishments.find((e) => e.kind === 'home')!
  expect(saved().profile.accounts).toEqual([{ id: expect.any(String), establishmentId: home.id, type: 'home', name: 'Logement' }])
  expect(screen.getByRole('button', { name: `Logement · ${formatEuros(30_000_000)}` })).toBeInTheDocument()
})

test('« Un autre logement » asks its type in the same form, nothing chosen in advance, and saves it', async () => {
  mocks.initial.current = started(['my-home', 'other-home'])
  render(<StepPage />)
  await add(/^Un autre logement/)
  // Its screen says what was picked, not « Logement », the word of every home.
  expect(screen.getByRole('heading', { level: 1, name: 'Un autre logement' })).toBeInTheDocument()
  expect(screen.getByText(plain('Quel type de logement ?'))).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Résidence secondaire' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('button', { name: 'Investissement locatif' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.queryByRole('button', { name: 'Résidence principale' })).toBeNull()
  await userEvent.type(screen.getByLabelText('Combien vaut-il, à peu près ?'), '150 000')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(screen.getByText('Choisis un type.')).toBeInTheDocument()
  expect(mocks.apply).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Investissement locatif' }))
  expect(screen.queryByText('Choisis un type.')).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  // Its name follows the type chosen, so that it reads apart from « Ma maison », named « Logement »,
  // without repeating the type the fiche already shows.
  expect(saved().profile.accounts).toEqual([expect.objectContaining({ type: 'home', name: 'Logement en location', residence: 'rental' })])
  expect(saved().snapshot.entries).toEqual([expect.objectContaining({ amount: 15_000_000 })])
})

test('the name of another home follows the type chosen until it is typed in', async () => {
  mocks.initial.current = started(['other-home'])
  render(<StepPage />)
  await add(/^Un autre logement/)
  const name = screen.getByLabelText('Son nom')
  expect(name).toHaveValue('')
  await userEvent.click(screen.getByRole('button', { name: 'Résidence secondaire' }))
  expect(name).toHaveValue('Résidence secondaire')
  await userEvent.click(screen.getByRole('button', { name: 'Investissement locatif' }))
  expect(name).toHaveValue('Logement en location')
  await userEvent.clear(name)
  await userEvent.type(name, 'Studio')
  await userEvent.click(screen.getByRole('button', { name: 'Résidence secondaire' }))
  expect(name).toHaveValue('Studio')
})

test('a home added as another one shows its type when reopened, and the type can be corrected there', async () => {
  const base = started(['other-home'])
  const home = base.profile.establishments.find((e) => e.kind === 'home')!
  mocks.initial.current = addSingleLineAccount(
    base,
    { establishmentId: home.id, type: 'home', name: 'Chalet', entry: { kind: 'amount', amount: 20_000_000 }, residence: 'rental' },
    TODAY,
  )
  render(<StepPage />)
  await userEvent.click(screen.getByRole('button', { name: `Chalet · ${formatEuros(20_000_000)}` }))
  expect(screen.getByRole('button', { name: 'Investissement locatif' })).toHaveAttribute('aria-pressed', 'true')
  await userEvent.click(screen.getByRole('button', { name: 'Résidence secondaire' }))
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(saved().profile.accounts[0]).toMatchObject({ name: 'Chalet', residence: 'secondary' })
})

test('a main home reopened asks no type and stays without a mark', async () => {
  const base = started(['my-home'])
  const home = base.profile.establishments.find((e) => e.kind === 'home')!
  mocks.initial.current = addSingleLineAccount(
    base,
    { establishmentId: home.id, type: 'home', name: 'Logement', entry: { kind: 'amount', amount: 30_000_000 } },
    TODAY,
  )
  render(<StepPage />)
  await userEvent.click(screen.getByRole('button', { name: `Logement · ${formatEuros(30_000_000)}` }))
  expect(screen.queryByRole('button', { name: 'Résidence secondaire' })).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(saved().profile.accounts[0]).not.toHaveProperty('residence')
})

test('a reopened gold line in parts can be turned into an amount', async () => {
  mocks.initial.current = started(['gold'])
  render(<StepPage />)
  await add(/^Or/)
  await userEvent.type(screen.getByLabelText('Quelle quantité en as-tu ?'), '10')
  await userEvent.type(screen.getByLabelText('Combien vaut une unité aujourd’hui ?'), '60')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  await userEvent.click(screen.getByRole('button', { name: /^Or ·/ }))
  expect(screen.getByLabelText('Quelle quantité en as-tu ?')).toHaveValue('10')
  await userEvent.click(screen.getByRole('button', { name: 'Je ne connais que le montant' }))
  await userEvent.type(screen.getByLabelText('Combien y a-t-il dessus ?'), '700')
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(saved().profile.lines).toHaveLength(1)
  expect(saved().profile.lines[0]).toMatchObject({ kind: 'amount' })
  expect(saved().snapshot.entries).toEqual([expect.objectContaining({ kind: 'amount', amount: 70_000 })])
})

test('« ‹ Retour » on the list of a later step reopens the step before it', async () => {
  const base = started(['my-home'])
  const [home] = steps(base.profile)
  mocks.initial.current = finishStep(base, home.id)
  render(<StepPage />)
  expect(screen.getByRole('heading', { level: 1, name: 'Qu’as-tu chez BoursoBank\u00A0?' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '‹ Retour' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '‹ Retour' }))
  expect(mocks.apply).toHaveBeenCalledOnce()
  expect(saved().profile.firstLaunch?.finished).toEqual([])
  expect(screen.getByRole('heading', { level: 1, name: 'Qu’as-tu hors des banques\u00A0?' })).toBeInTheDocument()
  expect(screen.getByText('1 sur 2')).toBeInTheDocument()
  // On the first step, it still leads to the choice of banks.
  expect(screen.getByRole('link', { name: '‹ Retour' })).toHaveAttribute('href', '/premier-lancement/ou')
})

test('a reopening that cannot be saved says so and stays', async () => {
  const base = started(['my-home'])
  mocks.initial.current = finishStep(base, steps(base.profile)[0].id)
  mocks.fail.current = true
  mocks.saveError.current = 'Ça n’a pas été enregistré. Vérifie ta connexion et réessaie.'
  render(<StepPage />)
  await userEvent.click(screen.getByRole('button', { name: '‹ Retour' }))
  expect(screen.getByRole('heading', { level: 1, name: 'Qu’as-tu chez BoursoBank\u00A0?' })).toBeInTheDocument()
  expect(screen.getByText(/Ça n’a pas été enregistré/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '‹ Retour' })).toBeEnabled()
})

test('a first launch already complete goes to Mon argent', () => {
  const base = started()
  mocks.initial.current = { ...base, profile: { ...base.profile, firstLaunch: { ...base.profile.firstLaunch!, complete: true } } }
  render(<StepPage />)
  expect(mocks.replace).toHaveBeenCalledWith('/')
  expect(screen.queryByRole('button', { name: 'Ajouter' })).not.toBeInTheDocument()
})

test.each([[/^Assurance-vie/], [/^PER/]])('%s offers its units of account as one amount, filed in markets', async (type) => {
  render(<StepPage />)
  await add(type)
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(screen.getByRole('button', { name: '+ Le fonds euros' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '+ Une action ou un fonds' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '+ Les unités de compte' }))
  expect(screen.getByLabelText('Son nom')).toHaveValue('Unités de compte')
  await userEvent.type(screen.getByLabelText('Combien y a-t-il dessus ?'), '4000')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(saved().profile.lines[0]).toMatchObject({ name: 'Unités de compte', kind: 'amount', category: 'markets' })
  expect(saved().snapshot.entries[0]).toMatchObject({ kind: 'amount', amount: 400_000 })

  // Corrected later, it stays in markets.
  await userEvent.click(screen.getByRole('button', { name: `Unités de compte · ${formatEuros(400_000)}` }))
  const field = screen.getByLabelText('Combien y a-t-il dessus ?')
  await userEvent.clear(field)
  await userEvent.type(field, '4500')
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  expect(saved().profile.lines[0]).toMatchObject({ category: 'markets' })
  expect(saved().snapshot.entries[0]).toMatchObject({ amount: 450_000 })
})

test('the euro fund stays in secured savings', async () => {
  render(<StepPage />)
  await add(/^Assurance-vie/)
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  await userEvent.click(screen.getByRole('button', { name: '+ Le fonds euros' }))
  await userEvent.type(screen.getByLabelText('Combien y a-t-il dessus ?'), '1000')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(saved().profile.lines[0].category).toBeUndefined()
})

test('« Plus tard » on the main view of a step goes home, and is absent inside a form view', async () => {
  render(<StepPage />)
  await userEvent.click(screen.getByRole('button', { name: 'Plus tard' }))
  expect(mocks.push).toHaveBeenCalledWith('/')

  await userEvent.click(screen.getByRole('button', { name: '+ Ajouter un compte' }))
  expect(screen.queryByRole('button', { name: 'Plus tard' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /^Livret A/ }))
  expect(screen.queryByRole('button', { name: 'Plus tard' })).not.toBeInTheDocument()
})
