// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { TypePicker } from '@/components/setup/TypePicker'

afterEach(cleanup)

const bank = { id: 'b', name: 'BoursoBank', kind: 'institution' as const, catalogId: 'boursobank' }

test('a bank shows the four families in order, explanations under the acronyms, and the way out', async () => {
  const onPick = vi.fn()
  render(<TypePicker establishment={bank} planned={[]} onPick={onPick} />)
  expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual([
    'Comptes et livrets',
    'Placements',
    'Retraite et entreprise',
    'Crédit, or et crypto',
  ])
  const holdings = screen.getByRole('heading', { name: 'Crédit, or et crypto' }).closest('section')!
  expect(within(holdings).getAllByRole('button').map((b) => b.textContent)).toEqual([
    'Crédit' + 'ce qu’il te reste à rembourser',
    'Or',
    'Crypto',
  ])
  expect(screen.getByText('plan d’épargne en actions')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^Épargne salariale/ })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Je ne trouve pas mon compte' }))
  expect(onPick).toHaveBeenCalledWith('other')
})

test('a crypto platform puts « Crédit, or et crypto » first, Crypto first inside it', () => {
  const coinbase = { id: 'c', name: 'Coinbase', kind: 'institution' as const, catalogId: 'coinbase' }
  render(<TypePicker establishment={coinbase} planned={[]} onPick={vi.fn()} />)
  expect(screen.getAllByRole('heading')[0]).toHaveTextContent('Crédit, or et crypto')
  const holdings = screen.getAllByRole('heading')[0].closest('section')!
  expect(within(holdings).getAllByRole('button').map((b) => b.textContent)).toEqual([
    'Crypto',
    'Or',
    'Crédit' + 'ce qu’il te reste à rembourser',
  ])
})

test('« Chez toi » lists the planned items first, then the rest, without Crédit', () => {
  const home = { id: 'h', name: 'Chez toi', kind: 'home' as const }
  render(<TypePicker establishment={home} planned={['crypto']} onPick={vi.fn()} />)
  const names = screen.getAllByRole('button').map((b) => b.textContent)
  expect(names).toEqual(['Crypto', 'Logement', 'Or'])
})

test('« Chez toi » puts the ticked items in the order of the list of choices, not the order they were touched', () => {
  const home = { id: 'h', name: 'Chez toi', kind: 'home' as const }
  render(<TypePicker establishment={home} planned={['loan', 'crypto', 'my-home']} onPick={vi.fn()} />)
  const names = screen.getAllByRole('button').map((b) => b.textContent)
  expect(names).toEqual(['Logement', 'Crypto', 'Or'])
})

test('in the first launch, « Chez toi » offers « Mon logement » and « Un autre logement » in place of « Logement », ticked ones first', async () => {
  const home = { id: 'h', name: 'Chez toi', kind: 'home' as const }
  const onPick = vi.fn()
  render(<TypePicker establishment={home} planned={['crypto', 'other-home']} splitHome onPick={onPick} />)
  expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
    'Un autre logement' + 'Résidence secondaire ou bien mis en location',
    'Crypto',
    'Mon logement' + 'Maison ou appartement, là où tu vis',
    'Or',
  ])
  // « Mon logement » is picked as « Logement » always was; only « Un autre logement » asks for its type.
  await userEvent.click(screen.getByRole('button', { name: /^Mon logement/ }))
  expect(onPick).toHaveBeenLastCalledWith('home')
  await userEvent.click(screen.getByRole('button', { name: /^Un autre logement/ }))
  expect(onPick).toHaveBeenLastCalledWith('home', true)
})

test('in the first launch with nothing ticked, the two homes come where « Logement » was', () => {
  const home = { id: 'h', name: 'Chez toi', kind: 'home' as const }
  render(<TypePicker establishment={home} planned={[]} splitHome onPick={vi.fn()} />)
  expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
    'Mon logement' + 'Maison ou appartement, là où tu vis',
    'Un autre logement' + 'Résidence secondaire ou bien mis en location',
    'Or',
    'Crypto',
  ])
})
