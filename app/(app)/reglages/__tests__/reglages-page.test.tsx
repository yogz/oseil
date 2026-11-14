// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Model, ModelState } from '@/lib/app/use-model'
import { GOAL_PRESETS } from '@/lib/catalog'
import { exampleProfile, exampleSnapshot } from '@/lib/model/__tests__/fixtures'
import { DEFAULT_SETTINGS } from '@/lib/model/documents'
import { SETTINGS_ANCHORS } from '@/lib/screens/find-words'
import type { GoalAllocation, Profile, Settings } from '@/lib/model/types'
import { PasswordHalfChangedError, RecoveryKeyReplacedError, WrongPasswordError } from '@/lib/vault/store'
import { confirmRecoveryKey } from '@/components/__tests__/confirm-recovery-key'
import SettingsPage from '../page'

const mocks = vi.hoisted(() => ({
  state: { current: {} as unknown },
  reload: vi.fn(),
  saveSettings: vi.fn(),
  saveCorrection: vi.fn(),
  changePassword: vi.fn(),
  remakeRecoveryKey: vi.fn(),
  confirmRecoveryKeySeen: vi.fn(),
  listFaceIdKeys: vi.fn(),
  removeFaceIdKey: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/app/use-model', () => ({ useModel: () => mocks.state.current }))
vi.mock('@/lib/model/repository', async (original) => ({
  ...(await original<typeof import('@/lib/model/repository')>()),
  saveSettings: mocks.saveSettings,
}))
vi.mock('@/lib/correct/save', () => ({ saveCorrection: mocks.saveCorrection }))
vi.mock('@/lib/vault/store', async (original) => ({
  ...(await original<typeof import('@/lib/vault/store')>()),
  changePassword: mocks.changePassword,
  remakeRecoveryKey: mocks.remakeRecoveryKey,
  confirmRecoveryKeySeen: mocks.confirmRecoveryKeySeen,
}))
vi.mock('@/lib/auth/face-id', () => ({ listFaceIdKeys: mocks.listFaceIdKeys, removeFaceIdKey: mocks.removeFaceIdKey }))
vi.mock('@/lib/supabase/browser', () => ({ createBrowserSupabase: () => ({}) }))
vi.mock('@/lib/vault/device', () => ({ indexedDbKeyStore: () => ({}) }))
vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props} />,
}))

const dataKey = {} as CryptoKey
const client = { auth: { getUser: mocks.getUser }, rpc: mocks.rpc } as never
const loaded = <T,>(value: T, id = 'x') => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })
const balanced: GoalAllocation = { schema: 1, validFrom: '2026-01-01', shares: GOAL_PRESETS.balanced.shares }
// A third bank with no account: the only one that can be removed.
const withEmptyBank: Profile = {
  ...exampleProfile,
  establishments: [{ id: 'fortuneo', name: 'Fortuneo', kind: 'institution' }, ...exampleProfile.establishments],
}

function ready(parts: { profile?: Profile | null; settings?: Settings | null; goals?: boolean; unreadableSettings?: number } = {}): ModelState {
  const model: Model = {
    profile: parts.profile === null ? null : loaded(parts.profile ?? withEmptyBank),
    snapshots: [loaded(exampleSnapshot, 's0')],
    goals: parts.goals === false ? [] : [loaded(balanced, 'g0')],
    settings: parts.settings ? loaded(parts.settings, 'settings-1') : null,
    draft: null,
    unreadable: { profile: 0, snapshots: 0, goals: 0, settings: parts.unreadableSettings ?? 0, draft: 0 },
  }
  return { status: 'ready', model, client, dataKey, reload: mocks.reload }
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) if (typeof mock === 'function' && 'mockReset' in mock) mock.mockReset()
  mocks.saveSettings.mockResolvedValue('settings-1')
  mocks.saveCorrection.mockResolvedValue('saved')
  mocks.getUser.mockResolvedValue({ data: { user: { email: 'nicolas@example.com' } } })
  mocks.listFaceIdKeys.mockResolvedValue([])
  mocks.rpc.mockResolvedValue({ data: true, error: null })
  mocks.state.current = ready()
})
afterEach(cleanup)

const section = (name: string) => screen.getByRole('region', { name })

// « Trouver » leads to a section by its anchor: each section carries its id, and keeps its title clear
// of the menu at the top of a computer.
test('each section carries the anchor « Trouver » leads to, in order', () => {
  const { container } = render(<SettingsPage />)
  const sections = [...container.querySelectorAll('section[id]')]
  expect(sections.map((s) => s.id)).toEqual([
    SETTINGS_ANCHORS.goals,
    SETTINGS_ANCHORS.spending,
    SETTINGS_ANCHORS.banks,
    SETTINGS_ANCHORS.display,
    SETTINGS_ANCHORS.data,
    SETTINGS_ANCHORS.reminder,
    SETTINGS_ANCHORS.account,
  ])
  for (const section of sections) expect(section).toHaveClass('lg:scroll-mt-24')
})

// The vault's wait comes before the sections: the browser finds no anchor on arrival, so the page goes
// to it once its sections are there.
// jsdom has no scrollIntoView: the test lends one, and the page's address, both given back after it.
const scrollKept = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView')
const addressKept = window.location.href
afterEach(() => {
  if (scrollKept) Object.defineProperty(Element.prototype, 'scrollIntoView', scrollKept)
  else delete (Element.prototype as Partial<Element>).scrollIntoView
  window.history.replaceState(null, '', addressKept)
})

test('opened at an anchor, the page goes to that section once it is ready', () => {
  const scroll = vi.fn()
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, writable: true, value: scroll })
  window.history.replaceState(null, '', `/reglages#${SETTINGS_ANCHORS.account}`)
  mocks.state.current = { status: 'loading' }
  const { container, rerender } = render(<SettingsPage />)
  expect(scroll).not.toHaveBeenCalled()
  mocks.state.current = ready()
  rerender(<SettingsPage />)
  expect(scroll).toHaveBeenCalledTimes(1)
  expect(scroll.mock.contexts[0]).toBe(container.querySelector(`section#${SETTINGS_ANCHORS.account}`))
  rerender(<SettingsPage />)
  expect(scroll).toHaveBeenCalledTimes(1)
})

test('the magnifier « Trouver » is at the top of the Réglages, after the way back for VoiceOver and the keyboard', () => {
  render(<SettingsPage />)
  const find = screen.getByRole('link', { name: 'Trouver' })
  expect(find).toHaveAttribute('href', '/trouver')
  const back = screen.getByRole('link', { name: '‹ Mon argent' })
  expect(back.compareDocumentPosition(find) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(find.compareDocumentPosition(screen.getByRole('heading', { level: 1 })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('with no profile yet, « Mes banques » keeps its anchor', () => {
  mocks.state.current = ready({ profile: null })
  const { container } = render(<SettingsPage />)
  expect(container.querySelector(`section#${SETTINGS_ANCHORS.banks}`)).not.toBeNull()
})

test('back to Mon argent, the tabs at the bottom, its seven sections in order', () => {
  render(<SettingsPage />)
  expect(screen.getByRole('heading', { level: 1, name: 'Réglages' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '‹ Mon argent' })).toHaveAttribute('href', '/')
  // The tabs are on the settings as on every screen that is neither the update nor the first launch.
  const tabs = screen.getByRole('navigation', { name: 'Onglets' })
  expect(within(tabs).getAllByRole('link')).toHaveLength(3)
  expect(within(tabs).queryByRole('link', { current: 'page' })).toBeNull()
  // The « › » of a title that opens a screen is drawn, not read.
  const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent?.replace('›', '').trim())
  expect(titles).toEqual(['Mes objectifs', 'Mes dépenses par mois', 'Mes banques', 'Affichage', 'Mes chiffres en fichier', 'Le rappel de mise à jour', 'Mon compte'])
  expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeInTheDocument()
})

test('the reminder e-mail, read from the base, just above « Mon compte »', async () => {
  render(<SettingsPage />)
  const toggle = await within(section('Le rappel de mise à jour')).findByRole('switch', { name: 'Me le rappeler par e-mail' })
  expect(toggle).toHaveAttribute('aria-checked', 'true')
  expect(mocks.rpc).toHaveBeenCalledWith('my_reminder_email')
})

test('« Mon compte » leads to the privacy page', () => {
  render(<SettingsPage />)
  expect(within(section('Mon compte')).getByRole('link', { name: 'Confidentialité' })).toHaveAttribute(
    'href',
    '/confidentialite',
  )
})

// Nothing is deleted from the Réglages: the last row of « Mon compte » leads to a screen of its own.
test('« Mon compte » ends on a link to delete the account, on its own screen', () => {
  render(<SettingsPage />)
  const links = within(section('Mon compte')).getAllByRole('link')
  expect(links.at(-1)).toHaveTextContent('Supprimer mon compte')
  expect(links.at(-1)).toHaveAttribute('href', '/reglages/supprimer')
  expect(within(section('Mon compte')).queryByRole('button', { name: /Supprimer/ })).toBeNull()
})

test('a new account has no profile yet: « Mes banques » says there is no bank, not that a read failed', () => {
  mocks.state.current = ready({ profile: null })
  render(<SettingsPage />)
  const banks = section('Mes banques')
  expect(within(banks).getByText('Aucune banque pour l’instant.')).toBeInTheDocument()
  expect(within(banks).queryByRole('alert')).toBeNull()
})

test('a profile that is there but cannot be read is an error, and says nothing was erased', () => {
  const state = ready({ profile: null }) as Extract<ModelState, { status: 'ready' }>
  mocks.state.current = { ...state, model: { ...state.model, unreadable: { ...state.model.unreadable, profile: 1 } } }
  render(<SettingsPage />)
  expect(within(section('Mes banques')).getByRole('alert')).toHaveTextContent('Ton profil n’a pas pu être lu.')
})

test('the goals as a small bar and the spending with its basis, each leading to the first launch screen', () => {
  mocks.state.current = ready({ settings: { ...DEFAULT_SETTINGS, budget: { basis: 'salary', monthly: 220_000 } } })
  const { container } = render(<SettingsPage />)
  expect(within(section('Mes objectifs')).getByRole('img', { name: /Placements en bourse 45\s%/ })).toBeInTheDocument()
  expect(container.querySelectorAll('[data-part="share"]')).toHaveLength(4)
  // The percents are written under the bar, so a saved goal reads at a glance.
  const goals = section('Mes objectifs')
  for (const [label, share] of [['Argent disponible', 25], ['Épargne sécurisée', 25], ['Placements en bourse', 45], ['Or et crypto', 5]] as const) {
    expect(goals).toHaveTextContent(new RegExp(`${label}\\s*${share}\\s%`))
  }
  // Planche 3B (Nicolas, 12 November 2026): no « Modifier » row; the title is the link, named by the
  // title alone, and the whole block (title, bar, legend) is what a finger touches.
  expectTitleLink(goals, 'Mes objectifs', '/premier-lancement/objectifs?depuis=reglages')
  // The UI pass of 12 November 2026: a budget given as revenues is titled so, never « dépenses ».
  const spending = section('Mes revenus par mois')
  expect(spending).toHaveTextContent(/2\s200\s€/)
  expectTitleLink(spending, 'Mes revenus par mois', '/premier-lancement/depenses?depuis=reglages')
})

function expectTitleLink(block: HTMLElement, title: string, href: string) {
  expect(within(block).queryByRole('link', { name: 'Modifier' })).toBeNull()
  expect(within(block).getAllByRole('link')).toHaveLength(1)
  const heading = within(block).getByRole('heading', { level: 2, name: title })
  const link = within(heading).getByRole('link', { name: title })
  expect(link).toHaveAttribute('href', href)
  expect(link).toHaveTextContent('›')
  // The link stretches over its block: the block is the reference, the link's after-layer covers it.
  expect(block.className).toMatch(/\brelative\b/)
  expect(link.className).toMatch(/after:absolute/)
  expect(link.className).toMatch(/after:inset-0/)
}

test('nothing set yet is said, not drawn as a zero', () => {
  mocks.state.current = ready({ goals: false })
  render(<SettingsPage />)
  expect(within(section('Mes objectifs')).getByText('Pas encore d’objectifs.')).toBeInTheDocument()
  expect(within(section('Mes dépenses par mois')).getByText('Pas encore renseignées.')).toBeInTheDocument()
  // Still a way in, by the title.
  expectTitleLink(section('Mes objectifs'), 'Mes objectifs', '/premier-lancement/objectifs?depuis=reglages')
  expectTitleLink(section('Mes dépenses par mois'), 'Mes dépenses par mois', '/premier-lancement/depenses?depuis=reglages')
})

// The arrows are not shown at rest (Nicolas, planche 2B, 12 November 2026): « Changer l’ordre » shows them.
const startOrdering = (banks: HTMLElement) => userEvent.click(within(banks).getByRole('button', { name: 'Changer l’ordre' }))

test('banks: only an empty one can be removed, the first cannot go up, the last cannot go down', async () => {
  render(<SettingsPage />)
  const banks = section('Mes banques')
  expect(within(within(banks).getByText('BoursoBank').closest('li')!).getByText('3 comptes')).toBeInTheDocument()
  expect(within(banks).getByRole('button', { name: 'Retirer\u00A0: Fortuneo' })).toBeEnabled()
  expect(within(banks).queryByRole('button', { name: 'Retirer\u00A0: BoursoBank' })).not.toBeInTheDocument()
  await startOrdering(banks)
  expect(within(banks).getByRole('button', { name: 'Monter\u00A0: Fortuneo' })).toBeDisabled()
  expect(within(banks).getByRole('button', { name: 'Descendre\u00A0: Linxea' })).toBeDisabled()
})

test('« Chez toi » is the first row of « Mes banques », without arrows, and cannot go while it holds accounts', () => {
  render(<SettingsPage />)
  const banks = section('Mes banques')
  const rows = within(banks).getAllByRole('listitem')
  expect(rows[0]).toHaveTextContent('Chez toi')
  expect(rows[0]).toHaveTextContent('3 comptes')
  expect(within(rows[0]).queryByRole('button')).not.toBeInTheDocument()
  expect(within(banks).queryByRole('button', { name: /Chez toi/ })).not.toBeInTheDocument()
})

test('an empty « Chez toi » is removable, and the removal writes a profile without it', async () => {
  const empty: Profile = {
    ...withEmptyBank,
    accounts: withEmptyBank.accounts.filter((a) => a.establishmentId !== 'home'),
    lines: withEmptyBank.lines.filter((l) => !['house-line', 'mortgage-line', 'gold-line'].includes(l.id)),
  }
  mocks.state.current = ready({ profile: empty })
  render(<SettingsPage />)
  const banks = section('Mes banques')
  expect(within(banks).getAllByRole('listitem')[0]).toHaveTextContent('Chez toi')
  await userEvent.click(within(banks).getByRole('button', { name: 'Retirer : Chez toi' }))
  const plan = mocks.saveCorrection.mock.calls[0][2] as (s: unknown) => { writes: Array<{ value: Profile }> }
  const planned = plan({ profile: { id: 'p', value: empty }, snapshots: [] })
  expect(planned.writes[0].value.establishments.map((e) => e.kind)).not.toContain('home')
  expect(mocks.reload).toHaveBeenCalled()
})

test('with only « Chez toi », « Mes banques » does not say there is no bank', () => {
  mocks.state.current = ready({
    profile: { schema: 1, establishments: [{ id: 'h', name: 'Chez toi', kind: 'home' }], accounts: [], lines: [] },
  })
  render(<SettingsPage />)
  const banks = section('Mes banques')
  expect(within(banks).getAllByRole('listitem')[0]).toHaveTextContent('Chez toi')
  expect(within(banks).queryByText('Aucune banque pour l’instant.')).not.toBeInTheDocument()
})

test('banks: the two arrows sit on the bank’s own line, at 44 px, beside its name', async () => {
  render(<SettingsPage />)
  const banks = section('Mes banques')
  await startOrdering(banks)
  const down = within(banks).getByRole('button', { name: 'Descendre\u00A0: BoursoBank' })
  const up = within(banks).getByRole('button', { name: 'Monter\u00A0: BoursoBank' })
  const row = within(banks).getByText('BoursoBank').closest('li')!
  expect(row).toContainElement(up)
  expect(row).toContainElement(down)
  // Same line as the name: the arrows and the name share one parent row, no second row of links.
  expect(up.parentElement!.parentElement).toBe(within(banks).getByText('BoursoBank').parentElement!.parentElement)
  for (const arrow of [up, down]) expect(arrow.className).toContain('size-11')
  expect(within(row).queryByText('Monter')).not.toBeInTheDocument()
})

test('removing and moving a bank write one profile through the correction save, then reload', async () => {
  render(<SettingsPage />)
  const banks = section('Mes banques')
  await userEvent.click(within(banks).getByRole('button', { name: 'Retirer\u00A0: Fortuneo' }))
  expect(mocks.saveCorrection).toHaveBeenCalledTimes(1)
  const plan = mocks.saveCorrection.mock.calls[0][2] as (s: unknown) => { writes: Array<{ value: Profile }> }
  const planned = plan({ profile: { id: 'p', value: withEmptyBank }, snapshots: [] })
  expect(planned.writes[0].value.establishments.map((e) => e.id)).not.toContain('fortuneo')
  expect(mocks.reload).toHaveBeenCalled()

  await startOrdering(banks)
  await userEvent.click(within(banks).getByRole('button', { name: 'Descendre\u00A0: BoursoBank' }))
  const move = mocks.saveCorrection.mock.calls[1][2] as typeof plan
  const moved = move({ profile: { id: 'p', value: withEmptyBank }, snapshots: [] })
  const order = moved.writes[0].value.establishments.map((e) => e.id)
  expect(order.indexOf('linxea')).toBeLessThan(order.indexOf('boursobank'))
})

test('moving a bank to the top keeps the keyboard on its line: « Monter » gone, the focus is on « Descendre »', async () => {
  const { rerender } = render(<SettingsPage />)
  const banks = () => section('Mes banques')
  await startOrdering(banks())
  const up = within(banks()).getByRole('button', { name: 'Monter : BoursoBank' })
  up.focus()
  await userEvent.keyboard('{Enter}')
  expect(mocks.saveCorrection).toHaveBeenCalledTimes(1)
  // The reload brings the profile with BoursoBank first.
  const moved: Profile = {
    ...withEmptyBank,
    establishments: [withEmptyBank.establishments[1], withEmptyBank.establishments[0], ...withEmptyBank.establishments.slice(2)],
  }
  mocks.state.current = ready({ profile: moved })
  rerender(<SettingsPage />)
  await waitFor(() => expect(within(banks()).getByRole('button', { name: 'Monter : BoursoBank' })).toBeDisabled())
  await waitFor(() => expect(document.activeElement).toBe(within(banks()).getByRole('button', { name: 'Descendre : BoursoBank' })))
})

test('a move refused keeps the focus on the arrow that was touched', async () => {
  mocks.saveCorrection.mockResolvedValueOnce('not-allowed')
  render(<SettingsPage />)
  const banks = section('Mes banques')
  await startOrdering(banks)
  const down = within(banks).getByRole('button', { name: 'Descendre : BoursoBank' })
  down.focus()
  await userEvent.keyboard('{Enter}')
  await within(banks).findByRole('alert')
  await waitFor(() => expect(document.activeElement).toBe(down))
})

test('adding a bank with the search, and the refusals shown in words', async () => {
  render(<SettingsPage />)
  const banks = section('Mes banques')
  await userEvent.click(within(banks).getByRole('button', { name: '+ Ajouter une banque' }))
  await userEvent.type(within(banks).getByLabelText('Chercher une banque…'), 'BNP Paribas')
  await userEvent.click(within(banks).getByRole('button', { name: 'BNP Paribas' }))
  const plan = mocks.saveCorrection.mock.calls[0][2] as (s: unknown) => { writes: Array<{ value: Profile }> }
  const planned = plan({ profile: { id: 'p', value: withEmptyBank }, snapshots: [] })
  expect(planned.writes[0].value.establishments.map((e) => e.name)).toContain('BNP Paribas')

  mocks.saveCorrection.mockResolvedValueOnce('update-running')
  await userEvent.click(within(banks).getByRole('button', { name: '+ Ajouter une banque' }))
  await userEvent.type(within(banks).getByLabelText('Chercher une banque…'), 'BNP Paribas')
  await userEvent.click(within(banks).getByRole('button', { name: 'BNP Paribas' }))
  expect(await within(banks).findByRole('alert')).toHaveTextContent('mise à jour')
})

const HOME_CHOICE = /^Chez toi$/
const HOME_CAPTION = 'un logement, de l’or ou de la crypto que tu gardes toi-même'
const withoutHome: Profile = {
  ...withEmptyBank,
  establishments: withEmptyBank.establishments.filter((e) => e.kind !== 'home'),
  accounts: withEmptyBank.accounts.filter((a) => a.establishmentId !== 'home'),
  lines: withEmptyBank.lines.filter((l) => !['house-line', 'mortgage-line', 'gold-line'].includes(l.id)),
}

test('« Chez toi » is offered among the banks to add only when the profile has none', async () => {
  const { unmount } = render(<SettingsPage />)
  await userEvent.click(within(section('Mes banques')).getByRole('button', { name: '+ Ajouter une banque' }))
  expect(within(section('Mes banques')).queryByRole('button', { name: HOME_CHOICE })).not.toBeInTheDocument()
  expect(within(section('Mes banques')).queryByText(HOME_CAPTION)).not.toBeInTheDocument()
  unmount()

  mocks.state.current = ready({ profile: withoutHome })
  render(<SettingsPage />)
  const banks = section('Mes banques')
  await userEvent.click(within(banks).getByRole('button', { name: '+ Ajouter une banque' }))
  // A chip like the catalogue banks, its sentence in a caption beside it (never inside a pill).
  expect(within(banks).getByText(HOME_CAPTION).className).toContain('text-caption')
  const chip = within(banks).getByRole('button', { name: HOME_CHOICE })
  expect(chip.className).toContain('rounded-full')
  expect(chip).not.toHaveTextContent('logement')
  await userEvent.click(chip)
  expect(mocks.saveCorrection).toHaveBeenCalledTimes(1)
  const plan = mocks.saveCorrection.mock.calls[0][2] as (s: unknown) => { writes: Array<{ value: Profile }> }
  const planned = plan({ profile: { id: 'p', value: withoutHome }, snapshots: [] })
  expect(planned.writes[0].value.establishments).toContainEqual({
    id: expect.any(String),
    name: 'Chez toi',
    kind: 'home',
  })
})

test('« Chez toi » already there at save time: its own word, and the screen reloads so the choice goes', async () => {
  mocks.state.current = ready({ profile: withoutHome })
  mocks.saveCorrection.mockResolvedValueOnce('not-allowed')
  render(<SettingsPage />)
  const banks = section('Mes banques')
  await userEvent.click(within(banks).getByRole('button', { name: '+ Ajouter une banque' }))
  await userEvent.click(within(banks).getByRole('button', { name: HOME_CHOICE }))
  expect(await within(banks).findByRole('alert')).toHaveTextContent('Chez toi est déjà dans ta liste.')
  expect(mocks.reload).toHaveBeenCalledTimes(1)
})

test('an impossible change is refused with its own word, a failed write says nothing changed', async () => {
  render(<SettingsPage />)
  const banks = section('Mes banques')
  mocks.saveCorrection.mockResolvedValueOnce('not-allowed')
  await userEvent.click(within(banks).getByRole('button', { name: 'Retirer\u00A0: Fortuneo' }))
  expect(await within(banks).findByRole('alert')).toHaveTextContent('Cette banque a encore des comptes')
  mocks.saveCorrection.mockRejectedValueOnce(new Error('network'))
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await userEvent.click(within(banks).getByRole('button', { name: 'Retirer\u00A0: Fortuneo' }))
  expect(await within(banks).findByRole('alert')).toHaveTextContent('Rien n’a changé')
  expect(mocks.reload).not.toHaveBeenCalled()
})

test('display: the unit and the masking are saved on the settings document, then the screen reloads', async () => {
  const settings: Settings = { ...DEFAULT_SETTINGS, budget: { basis: 'expenses', monthly: 200_000 } }
  mocks.state.current = ready({ settings })
  render(<SettingsPage />)
  const display = section('Affichage')
  expect(within(display).getByRole('button', { name: 'En euros' })).toHaveAttribute('aria-pressed', 'true')
  await userEvent.click(within(display).getByRole('button', { name: 'En %' }))
  expect(mocks.saveSettings).toHaveBeenLastCalledWith(client, dataKey, { ...settings, display: 'percent' }, 'settings-1')
  await userEvent.click(within(display).getByRole('switch', { name: 'Masquer les montants' }))
  expect(mocks.saveSettings).toHaveBeenLastCalledWith(
    client,
    dataKey,
    { ...settings, display: 'percent', hideAmounts: true },
    'settings-1',
  )
  expect(mocks.reload).toHaveBeenCalledTimes(2)
})

test('display: a failed save puts the switch back and says so', async () => {
  mocks.saveSettings.mockRejectedValue(new Error('network'))
  vi.spyOn(console, 'error').mockImplementation(() => {})
  render(<SettingsPage />)
  const display = section('Affichage')
  await userEvent.click(within(display).getByRole('switch', { name: 'Masquer les montants' }))
  expect(await within(display).findByRole('alert')).toHaveTextContent('Rien n’a changé')
  expect(within(display).getByRole('switch', { name: 'Masquer les montants' })).not.toBeChecked()
  expect(mocks.reload).not.toHaveBeenCalled()
})

test('with a single bank, there is nothing to move: no « Monter », no « Descendre »', () => {
  mocks.state.current = ready({
    profile: { ...exampleProfile, establishments: [exampleProfile.establishments[0]], accounts: [], lines: [] },
  })
  render(<SettingsPage />)
  const banks = section('Mes banques')
  expect(within(banks).queryByRole('button', { name: /^Monter/ })).not.toBeInTheDocument()
  expect(within(banks).queryByRole('button', { name: /^Descendre/ })).not.toBeInTheDocument()
  expect(within(banks).queryByRole('button', { name: 'Changer l’ordre' })).not.toBeInTheDocument()
  expect(within(banks).queryByText('L’ordre est celui de ta mise à jour.')).not.toBeInTheDocument()
})

test('banks: no arrows at rest; « Changer l’ordre » shows them on every bank, « Terminé » hides them again', async () => {
  render(<SettingsPage />)
  const banks = section('Mes banques')
  const arrows = () => within(banks).queryAllByRole('button', { name: /^(Monter|Descendre)/ })
  expect(arrows()).toHaveLength(0)
  // The note on the left, the control on the right, on one line.
  const note = within(banks).getByText('L’ordre est celui de ta mise à jour.')
  const change = within(banks).getByRole('button', { name: 'Changer l’ordre' })
  expect(change.parentElement).toBe(note.parentElement)
  expect(change.className).toContain('underline')
  expect(within(banks).getByRole('button', { name: '+ Ajouter une banque' })).toBeInTheDocument()

  await userEvent.click(change)
  // Three banks besides « Chez toi », two arrows each; « Chez toi » keeps its place, without arrows.
  expect(arrows()).toHaveLength(6)
  for (const name of ['Fortuneo', 'BoursoBank', 'Linxea']) {
    const row = within(banks).getByText(name).closest('li')!
    expect(within(row).getAllByRole('button', { name: /^(Monter|Descendre)/ })).toHaveLength(2)
  }
  expect(within(within(banks).getAllByRole('listitem')[0]).queryByRole('button', { name: /^(Monter|Descendre)/ })).toBeNull()
  // The keyboard lands on the first arrow that can be used: the first bank cannot go up.
  expect(document.activeElement).toBe(within(banks).getByRole('button', { name: 'Descendre\u00A0: Fortuneo' }))
  // While the order changes, no bank is added nor removed: nothing but the arrows (planche 2B).
  expect(within(banks).queryByRole('button', { name: '+ Ajouter une banque' })).not.toBeInTheDocument()
  expect(within(banks).queryAllByRole('button', { name: /^Retirer/ })).toHaveLength(0)
  expect(within(banks).queryByRole('button', { name: 'Changer l’ordre' })).not.toBeInTheDocument()
  const done = within(banks).getByRole('button', { name: 'Terminé' })
  expect(done.className).toContain('bg-ink')
  expect(done.className).toContain('rounded-full')

  await userEvent.click(done)
  expect(arrows()).toHaveLength(0)
  expect(within(banks).queryByRole('button', { name: 'Terminé' })).not.toBeInTheDocument()
  expect(document.activeElement).toBe(within(banks).getByRole('button', { name: 'Changer l’ordre' }))
  expect(within(banks).getByRole('button', { name: '+ Ajouter une banque' })).toBeInTheDocument()
  expect(within(banks).getByRole('button', { name: 'Retirer : Fortuneo' })).toBeInTheDocument()
})

test('the masking switch is a real switch, large enough to touch, in design tokens', async () => {
  render(<SettingsPage />)
  const toggle = within(section('Affichage')).getByRole('switch', { name: 'Masquer les montants' })
  expect(toggle.tagName).toBe('BUTTON')
  expect(toggle).toHaveAttribute('aria-checked', 'false')
  expect(toggle.className).toContain('min-h-11')
  await userEvent.click(toggle)
  expect(toggle).toHaveAttribute('aria-checked', 'true')
})

test('unreadable settings: the spending says so too, not « Pas encore renseignées »', () => {
  mocks.state.current = ready({ unreadableSettings: 1 })
  render(<SettingsPage />)
  const spending = section('Mes dépenses par mois')
  expect(spending).toHaveTextContent('Tes réglages n’ont pas pu être lus')
  expect(spending).not.toHaveTextContent('Pas encore renseignées.')
})

test('a long e-mail address wraps instead of breaking anywhere', async () => {
  render(<SettingsPage />)
  const email = await screen.findByText('nicolas@example.com')
  expect(email.className).not.toContain('break-all')
  expect(email.className).toContain('[overflow-wrap:anywhere]')
})

test('the password form can be cancelled, and an empty current password is asked for, not called wrong', async () => {
  render(<SettingsPage />)
  await screen.findByText('nicolas@example.com')
  const form = await openPasswordForm()
  await userEvent.click(form.submit)
  expect(screen.getByText('Tape ton mot de passe actuel.')).toBeInTheDocument()
  expect(screen.queryByText('Ce n’est pas ton mot de passe actuel.')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
  expect(screen.queryByLabelText('Mot de passe actuel')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Changer de mot de passe' })).toBeInTheDocument()
})

test('the recovery form can be cancelled, and an empty password is asked for', async () => {
  render(<SettingsPage />)
  await screen.findByText('nicolas@example.com')
  await userEvent.click(screen.getByRole('button', { name: 'Refaire ma clé de secours' }))
  await userEvent.click(screen.getByRole('button', { name: 'Recevoir une nouvelle clé' }))
  expect(screen.getByText('Tape ton mot de passe actuel.')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
  expect(screen.queryByLabelText('Ton mot de passe')).not.toBeInTheDocument()
  expect(mocks.remakeRecoveryKey).not.toHaveBeenCalled()
})

test('while the new recovery key is shown, the page has a single h1', async () => {
  mocks.remakeRecoveryKey.mockResolvedValue('AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG-HHHH')
  render(<SettingsPage />)
  await screen.findByText('nicolas@example.com')
  await userEvent.click(screen.getByRole('button', { name: 'Refaire ma clé de secours' }))
  await userEvent.type(screen.getByLabelText('Ton mot de passe'), 'mon-mot-de-passe')
  await userEvent.click(screen.getByRole('button', { name: 'Recevoir une nouvelle clé' }))
  expect(await screen.findByText(/AAAA-/)).toBeInTheDocument()
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  expect(screen.getByRole('heading', { level: 2, name: 'Ta clé de secours' })).toBeInTheDocument()
})

test('display: unreadable settings are never written over', () => {
  mocks.state.current = ready({ unreadableSettings: 1 })
  render(<SettingsPage />)
  expect(within(section('Affichage')).getByRole('alert')).toHaveTextContent('Tes réglages n’ont pas pu être lus')
  expect(within(section('Affichage')).queryByRole('switch')).not.toBeInTheDocument()
})

async function openPasswordForm() {
  await userEvent.click(screen.getByRole('button', { name: 'Changer de mot de passe' }))
  return {
    old: screen.getByLabelText('Mot de passe actuel'),
    next: screen.getByLabelText('Nouveau mot de passe'),
    again: screen.getByLabelText('Nouveau mot de passe, encore une fois'),
    submit: screen.getByRole('button', { name: 'Changer le mot de passe' }),
  }
}

test('the e-mail is shown, read only', async () => {
  render(<SettingsPage />)
  expect(await within(section('Mon compte')).findByText('nicolas@example.com')).toBeInTheDocument()
})

test('a password change sends the typed passwords to the vault only, and says it is done', async () => {
  mocks.changePassword.mockResolvedValue(dataKey)
  render(<SettingsPage />)
  await screen.findByText('nicolas@example.com')
  const form = await openPasswordForm()
  await userEvent.type(form.old, 'ancien-mot-de-passe')
  await userEvent.type(form.next, 'nouveau-mot-de-passe')
  await userEvent.type(form.again, 'nouveau-mot-de-passe')
  await userEvent.click(form.submit)
  expect(mocks.changePassword).toHaveBeenCalledWith(client, {
    email: 'nicolas@example.com',
    oldPassword: 'ancien-mot-de-passe',
    newPassword: 'nouveau-mot-de-passe',
  })
  expect(await screen.findByText('Ton mot de passe a changé.')).toBeInTheDocument()
})

test('a wrong old password, a short or mismatched new one: each refused in its field', async () => {
  render(<SettingsPage />)
  await screen.findByText('nicolas@example.com')
  const form = await openPasswordForm()
  await userEvent.type(form.old, 'pas-le-bon-mdp')
  await userEvent.type(form.next, 'court')
  await userEvent.type(form.again, 'court')
  await userEvent.click(form.submit)
  expect(screen.getByText('Au moins 10 caractères.')).toBeInTheDocument()
  await userEvent.clear(form.next)
  await userEvent.type(form.next, 'nouveau-mot-de-passe')
  await userEvent.click(form.submit)
  expect(screen.getByText('Les deux mots de passe sont différents.')).toBeInTheDocument()
  expect(mocks.changePassword).not.toHaveBeenCalled()

  mocks.changePassword.mockRejectedValue(new WrongPasswordError())
  await userEvent.clear(form.again)
  await userEvent.type(form.again, 'nouveau-mot-de-passe')
  await userEvent.click(form.submit)
  expect(await screen.findByText('Ce n’est pas ton mot de passe actuel.')).toBeInTheDocument()
})

test('a password changed by half is said, with what to do', async () => {
  mocks.changePassword.mockRejectedValue(new PasswordHalfChangedError())
  render(<SettingsPage />)
  await screen.findByText('nicolas@example.com')
  const form = await openPasswordForm()
  await userEvent.type(form.old, 'ancien-mot-de-passe')
  await userEvent.type(form.next, 'nouveau-mot-de-passe')
  await userEvent.type(form.again, 'nouveau-mot-de-passe')
  await userEvent.click(form.submit)
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Ton coffre a pris le nouveau mot de passe, mais la connexion n’a pas suivi. Ne te déconnecte pas : tape ton nouveau mot de passe dans les deux cases vides pour terminer.',
  )
  // The retry is a normal change with the new password in both boxes.
  expect(screen.getByLabelText('Nouveau mot de passe')).toHaveValue('nouveau-mot-de-passe')
})

test('remaking the recovery key: shown once, confirmed like the first launch', async () => {
  mocks.remakeRecoveryKey.mockResolvedValue('AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG-HHHH')
  mocks.confirmRecoveryKeySeen.mockResolvedValue(undefined)
  render(<SettingsPage />)
  await screen.findByText('nicolas@example.com')
  await userEvent.click(screen.getByRole('button', { name: 'Refaire ma clé de secours' }))
  await userEvent.type(screen.getByLabelText('Ton mot de passe'), 'mon-mot-de-passe')
  await userEvent.click(screen.getByRole('button', { name: 'Recevoir une nouvelle clé' }))
  expect(mocks.remakeRecoveryKey).toHaveBeenCalledWith(client, { email: 'nicolas@example.com', password: 'mon-mot-de-passe' })
  expect(await screen.findByText(/AAAA-/)).toBeInTheDocument()
  await confirmRecoveryKey(userEvent, 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG-HHHH')
  await waitFor(() =>
    expect(mocks.confirmRecoveryKeySeen).toHaveBeenCalledWith(client, 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG-HHHH'),
  )
  expect(await screen.findByText('Ta nouvelle clé de secours est en place.')).toBeInTheDocument()
  expect(screen.queryByText(/AAAA-/)).not.toBeInTheDocument()
})

test('recovery key: a wrong password and a key changed meanwhile are each said', async () => {
  render(<SettingsPage />)
  await screen.findByText('nicolas@example.com')
  await userEvent.click(screen.getByRole('button', { name: 'Refaire ma clé de secours' }))
  await userEvent.type(screen.getByLabelText('Ton mot de passe'), 'pas-le-bon')
  mocks.remakeRecoveryKey.mockRejectedValueOnce(new WrongPasswordError())
  await userEvent.click(screen.getByRole('button', { name: 'Recevoir une nouvelle clé' }))
  expect(await screen.findByText('Ce n’est pas ton mot de passe actuel.')).toBeInTheDocument()
  mocks.remakeRecoveryKey.mockResolvedValueOnce(null)
  await userEvent.click(screen.getByRole('button', { name: 'Recevoir une nouvelle clé' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Ta clé de secours a changé sur un autre appareil : recommence.')
  void RecoveryKeyReplacedError
})

test('Face ID keys: dated, this device marked, « Retirer » removes then lists again', async () => {
  const keys = [
    { passkeyId: 'k2', addedOn: '2026-11-07', onThisDevice: true },
    { passkeyId: 'k1', addedOn: '2026-10-02', onThisDevice: false },
  ]
  mocks.listFaceIdKeys.mockResolvedValueOnce(keys).mockResolvedValueOnce([keys[0]])
  mocks.removeFaceIdKey.mockResolvedValue(undefined)
  render(<SettingsPage />)
  const items = await screen.findAllByText(/ajoutée le/)
  expect(items).toHaveLength(2)
  expect(items[0]).toHaveTextContent('ajoutée le 7 novembre · cet appareil')
  expect(items[1]).not.toHaveTextContent('cet appareil')
  await userEvent.click(screen.getByRole('button', { name: /^Retirer\u00A0: ajoutée le 2 octobre/ }))
  expect(mocks.removeFaceIdKey).toHaveBeenCalledWith(client, 'k1')
  await waitFor(() => expect(screen.getAllByText(/ajoutée le/)).toHaveLength(1))
})

test('no Face ID key is said', async () => {
  render(<SettingsPage />)
  expect(await screen.findByText('Aucune clé Face ID pour l’instant.')).toBeInTheDocument()
})

// docs/superpowers/specs/2026-11-11-coussin-objectif-design.md: a goal in months is said in months, never « 0 % ».
test('a goal in months shows the available money in months, the others as parts of the rest', () => {
  const state = ready({ settings: { ...DEFAULT_SETTINGS, budget: { basis: 'expenses', monthly: 240_000 } } })
  if (state.status !== 'ready') throw new Error('not ready')
  state.model.goals = [
    loaded({ schema: 1, validFrom: '2026-01-01', shares: { available: 0, secured: 33, markets: 60, gold: 7, rental: 0 }, cushionMonths: 4 }, 'g1'),
  ]
  mocks.state.current = state
  render(<SettingsPage />)
  const goals = section('Mes objectifs')
  const text = (goals.textContent ?? '').replace(/[\u00A0\u202F]/g, ' ')
  expect(text).toContain('Argent disponible4 mois de dépenses, 9 600 €')
  expect(text).not.toMatch(/Argent disponible0/)
  expect(within(goals).getByRole('img', { name: /Argent disponible 4\smois de dépenses, 9\s600\s€, Épargne sécurisée 33\s%/ })).toBeInTheDocument()
})

test('a goal in months without a budget says its months alone', () => {
  const state = ready()
  if (state.status !== 'ready') throw new Error('not ready')
  state.model.goals = [
    loaded({ schema: 1, validFrom: '2026-01-01', shares: { available: 0, secured: 33, markets: 60, gold: 7, rental: 0 }, cushionMonths: 4 }, 'g1'),
  ]
  mocks.state.current = state
  render(<SettingsPage />)
  expect((section('Mes objectifs').textContent ?? '').replace(/[\u00A0\u202F]/g, ' ')).toContain('Argent disponible4 mois')
})
