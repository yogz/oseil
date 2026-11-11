// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Model, ModelState } from '@/lib/app/use-model'
import { exampleProfile, exampleSnapshot } from '@/lib/model/__tests__/fixtures'
import type { Profile } from '@/lib/model/types'
import WelcomePage from '../page'

const mocks = vi.hoisted(() => ({
  state: { current: { status: 'loading' } as ModelState },
  replace: vi.fn(),
}))

vi.mock('@/lib/app/use-model', () => ({ useModel: () => mocks.state.current }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }))
vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props} />
  ),
}))

const loaded = <T,>(value: T, id = 'x') => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })

function ready(profile: Profile | null): ModelState {
  const model: Model = {
    profile: profile ? loaded(profile) : null,
    snapshots: [loaded(exampleSnapshot, 's0')],
    goals: [],
    settings: null,
    draft: null,
    unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
  }
  return { status: 'ready', model, client: {} as never, dataKey: {} as CryptoKey, reload: vi.fn() }
}

beforeEach(() => {
  mocks.replace.mockReset()
  mocks.state.current = { status: 'loading' }
})
afterEach(cleanup)

test('the welcome says what the app is, shows a grid of one hundred squares and leads to the banks', () => {
  mocks.state.current = ready(null)
  const { container } = render(<WelcomePage />)
  expect(screen.getByRole('heading', { level: 1, name: 'Ton argent, en 100 carrés' })).toBeInTheDocument()
  expect(screen.getByText(/Chaque carré, c’est 1 % de ce qui est à toi/)).toBeInTheDocument()
  expect(screen.getByText(/Compte un quart d’heure/)).toBeInTheDocument()
  expect(screen.getByText('Tu peux t’arrêter quand tu veux, rien n’est perdu.')).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Une grille de cent carrés, en exemple' })).toBeInTheDocument()
  expect(container.querySelectorAll('[data-square]')).toHaveLength(100)
  expect(screen.getByRole('link', { name: 'C’est parti' })).toHaveAttribute('href', '/premier-lancement/ou')
  expect(mocks.replace).not.toHaveBeenCalled()
})

test('the example grid is a little smaller, so « Tu peux t’arrêter quand tu veux » shows without scrolling', () => {
  mocks.state.current = ready(null)
  render(<WelcomePage />)
  const grid = screen.getByRole('img', { name: 'Une grille de cent carrés, en exemple' })
  // One width whatever the model; on a short screen, only the height cap of the block shrinks the
  // box, and the grid follows it (e2e/premier-lancement.spec.ts measures it at 375 × 553 and 320 × 568).
  const box = grid.parentElement!.parentElement!
  expect(box.className).toContain('max-w-[15.5rem]')
  expect(box.className).toContain('[container-type:size]')
  expect(grid.parentElement!.className).toContain('w-[min(100cqw,100cqh)]')
  expect(box.parentElement!.className).toContain('max-h-[max(calc(100svh-0.75rem),32.5rem)]')
})

test('the welcome has « Se déconnecter »: the Réglages cannot be reached from here and nothing is typed yet', () => {
  mocks.state.current = ready(null)
  render(<WelcomePage />)
  expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeInTheDocument()
})

test('a profile already past the first launch goes to Mon argent', () => {
  mocks.state.current = ready(exampleProfile)
  render(<WelcomePage />)
  expect(mocks.replace).toHaveBeenCalledWith('/')
})

test('an unfinished launch with no establishment stays here: no loop with Mon argent', () => {
  mocks.state.current = ready({
    schema: 1,
    establishments: [],
    accounts: [],
    lines: [],
    firstLaunch: { planned: [], finished: [], complete: false },
  })
  render(<WelcomePage />)
  expect(mocks.replace).not.toHaveBeenCalled()
})

const IMPORT_LINK = 'Importer un fichier ou passer par ton IA'
const PLACEHOLDER: Profile = {
  schema: 1,
  establishments: [],
  accounts: [],
  lines: [],
  firstLaunch: { planned: [], finished: [], complete: false },
}

test('an empty vault is offered the import, under « Tu peux t’arrêter… »', () => {
  mocks.state.current = ready(null)
  render(<WelcomePage />)
  const link = screen.getByRole('link', { name: IMPORT_LINK })
  expect(link).toHaveAttribute('href', '/premier-lancement/importer')
  const stop = screen.getByText('Tu peux t’arrêter quand tu veux, rien n’est perdu.')
  expect(stop.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  // The template is downloaded from the import screen, not here.
  expect(screen.queryByText(/modèle/)).toBeNull()
})

test('the placeholder profile of an import cut short still counts as empty', () => {
  mocks.state.current = ready(PLACEHOLDER)
  render(<WelcomePage />)
  expect(screen.getByRole('link', { name: IMPORT_LINK })).toBeInTheDocument()
})

test('no import once a bank is chosen', () => {
  mocks.state.current = ready({
    ...PLACEHOLDER,
    establishments: [{ id: 'e1', name: 'BoursoBank', kind: 'institution', catalogId: 'boursobank' }],
  })
  render(<WelcomePage />)
  expect(screen.queryByRole('link', { name: IMPORT_LINK })).toBeNull()
})

test('no import when the profile cannot be read', () => {
  const state = ready(null)
  if (state.status !== 'ready') throw new Error('ready')
  mocks.state.current = { ...state, model: { ...state.model, unreadable: { ...state.model.unreadable, profile: 1 } } }
  render(<WelcomePage />)
  expect(screen.queryByRole('link', { name: IMPORT_LINK })).toBeNull()
})

test('the grid keeps one width and the link keeps its line, before and after the vault loads', () => {
  const grid = () => screen.getByRole('img', { name: 'Une grille de cent carrés, en exemple' }).parentElement!.className
  const line = () => document.querySelector('[data-import-line]')!
  const { rerender } = render(<WelcomePage />)
  const before = grid()
  expect(line().className).toContain('min-h-11')
  expect(line().childElementCount).toBe(0)
  mocks.state.current = ready(null)
  rerender(<WelcomePage />)
  expect(grid()).toBe(before)
  expect(line().className).toContain('min-h-11')
  expect(screen.getByRole('link', { name: IMPORT_LINK })).toBeInTheDocument()
})

test('no import while the model loads', () => {
  render(<WelcomePage />)
  expect(screen.queryByRole('link', { name: IMPORT_LINK })).toBeNull()
})

test('a first launch marked complete goes to Mon argent', () => {
  mocks.state.current = ready({ ...exampleProfile, firstLaunch: { planned: [], finished: ['boursobank', 'linxea', 'home'], complete: true } })
  render(<WelcomePage />)
  expect(mocks.replace).toHaveBeenCalledWith('/')
})
