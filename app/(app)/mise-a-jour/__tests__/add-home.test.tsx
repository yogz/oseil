// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { AddFlow } from '@/components/update/AddFlow'
import { exampleProfile } from '@/lib/model/__tests__/fixtures'
import type { UpdateDraft } from '@/lib/model/types'
import { startDraft } from '@/lib/update/draft'

vi.mock('@/lib/market/use-market', () => ({
  useRates: () => ({ status: 'idle' }),
}))
afterEach(cleanup)

// « Chez toi », where a home bought since is added during the monthly update.
const home = exampleProfile.establishments.find((e) => e.kind === 'home')!
const seen: { draft: UpdateDraft | null; calls: number } = { draft: null, calls: 0 }

function Host() {
  const [draft, setDraft] = useState(startDraft('s1'))
  return (
    <AddFlow
      profile={exampleProfile}
      draft={draft}
      establishment={home}
      saveError={null}
      change={async (f) => {
        const next = f(draft)
        seen.draft = next
        seen.calls += 1
        setDraft(next)
        return true
      }}
      onDone={() => {}}
    />
  )
}

async function newHome() {
  seen.draft = null
  seen.calls = 0
  render(<Host />)
  await userEvent.click(screen.getByRole('button', { name: /^Logement/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Je l’avais déjà' }))
}

test('a home added in the update asks its type, between all three, nothing chosen in advance', async () => {
  await newHome()
  expect(screen.getByText(/^Quel type de logement/)).toBeInTheDocument()
  for (const name of ['Résidence principale', 'Résidence secondaire', 'Investissement locatif']) {
    expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false')
  }
  expect(screen.getByLabelText('Son nom')).toHaveValue('')
  await userEvent.type(screen.getByLabelText('Combien vaut-il, à peu près ?'), '150 000')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(screen.getByText('Choisis un type.')).toBeInTheDocument()
  expect(seen.calls).toBe(0)
})

test('a rental added in the update is saved as one, named apart from its type', async () => {
  await newHome()
  await userEvent.click(screen.getByRole('button', { name: 'Investissement locatif' }))
  expect(screen.getByLabelText('Son nom')).toHaveValue('Logement en location')
  await userEvent.type(screen.getByLabelText('Combien vaut-il, à peu près ?'), '150 000')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  expect(seen.draft!.added.accounts).toEqual([
    expect.objectContaining({ establishmentId: home.id, type: 'home', name: 'Logement en location', residence: 'rental' }),
  ])
  expect(seen.draft!.added.lines).toEqual([expect.objectContaining({ name: 'Logement en location' })])
})

test('a secondary home keeps the name of its type; a main one is « Logement », written as no mark', async () => {
  await newHome()
  await userEvent.click(screen.getByRole('button', { name: 'Résidence secondaire' }))
  expect(screen.getByLabelText('Son nom')).toHaveValue('Résidence secondaire')
  await userEvent.click(screen.getByRole('button', { name: 'Résidence principale' }))
  expect(screen.getByLabelText('Son nom')).toHaveValue('Logement')
  await userEvent.type(screen.getByLabelText('Combien vaut-il, à peu près ?'), '300 000')
  await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
  const [account] = seen.draft!.added.accounts
  expect(account).toMatchObject({ type: 'home', name: 'Logement' })
  expect(account).not.toHaveProperty('residence')
})

test('gold added at home asks no type of home', async () => {
  seen.calls = 0
  render(<Host />)
  await userEvent.click(screen.getByRole('button', { name: /^Or/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Je l’avais déjà' }))
  expect(screen.queryByText(/^Quel type de logement/)).toBeNull()
})
